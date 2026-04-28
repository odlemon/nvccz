// @ts-nocheck
import fs from "fs";
import { prisma } from "../utils/database";

jest.mock("../services/performanceDocumentRenderer", () => ({
  renderPerformanceReviewPdf: jest.fn(async () => "C:\\\\tmp\\\\performance-review.pdf")
}));

jest.mock("../services/AuditService", () => ({
  __esModule: true,
  default: { log: jest.fn(async () => undefined) }
}));

const { PerformanceReviewService } = require("../services/PerformanceReviewService");
const { PerformanceReviewController } = require("../controllers/PerformanceReviewController");

function buildReview(overrides: any = {}) {
  return {
    id: "review_1",
    status: "IN_PROGRESS",
    stage: "FINAL_REVIEW",
    isLocked: false,
    documentPath: null,
    documentPayload: null,
    documentStatus: "DRAFT",
    reviewPeriod: "2026",
    overallScore: 4,
    ratingValue: 4,
    rating: "MEETS_EXPECTATIONS",
    selfFeedback: "x".repeat(60),
    managerFeedback: "y".repeat(60),
    peerFeedback: "z".repeat(60),
    quantitativeSnapshot: { goals: [], tasks: [], generatedAt: new Date().toISOString() },
    revieweeId: "user_reviewee",
    reviewerId: "user_reviewer",
    reviewee: {
      id: "user_reviewee",
      firstName: "Jane",
      lastName: "Doe",
      departmentId: "dept_1",
      department: { id: "dept_1", name: "HR" },
      userDepartment: "HR",
      employee: { lineManagerUserId: "user_manager" }
    },
    reviewer: { id: "user_reviewer", departmentId: "dept_1", department: { id: "dept_1", name: "HR" } },
    reviewFeedback: [],
    ...overrides
  };
}

describe("Reviews UAT — validation + finalize PDF", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure prisma mock has the review model methods used by the service.
    if (!(prisma as any).performanceReview) {
      (prisma as any).performanceReview = {};
    }
    (prisma as any).performanceReview.findUnique = jest.fn();
    (prisma as any).performanceReview.update = jest.fn();
    (prisma as any).performanceReview.create = jest.fn();
  });

  test("Manager 1–5 scale rejects non-integers/out-of-range", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "actor",
      role: { name: "admin" },
      departmentId: "dept_1",
      department: { name: "HR" },
      employee: null
    });

    await expect(
      PerformanceReviewService.createPerformanceReview(
        {
          reviewType: "ANNUAL",
          reviewPeriod: "2026",
          title: "Test",
          description: "",
          revieweeId: "user_reviewee",
          reviewerId: "user_reviewer",
          ratingValue: 7,
          scores: [{ rating: 7 }]
        },
        { id: "actor" }
      )
    ).rejects.toThrow(/whole numbers between 1 and 5|between 1 and 5|whole number from 1 to 5/i);
  });

  test("Qualitative feedback enforces minimum length 50", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "actor",
      role: { name: "admin" },
      departmentId: "dept_1",
      department: { name: "HR" },
      employee: null
    });

    await expect(
      PerformanceReviewService.createPerformanceReview(
        {
          reviewType: "ANNUAL",
          reviewPeriod: "2026",
          title: "Test",
          revieweeId: "user_reviewee",
          reviewerId: "user_reviewer",
          managerFeedback: "too short",
          scores: [{ rating: 3 }]
        },
        { id: "actor" }
      )
    ).rejects.toThrow(/at least 50 characters/i);
  });

  test("Finalize generates PDF path and locks review", async () => {
    const review = buildReview();
    ((prisma as any).performanceReview.findUnique as any).mockResolvedValue(review);

    (prisma.user.findUnique as any).mockResolvedValue({
      id: "actor",
      role: { name: "admin" },
      departmentId: "dept_1",
      department: { name: "HR" },
      employee: null
    });

    ((prisma as any).performanceReview.update as any).mockImplementation(async ({ data }: any) => ({
      ...review,
      ...data,
      documentPath: data.documentPath
    }));

    const updated = await PerformanceReviewService.finalizePerformanceReview("review_1", { id: "actor" });
    expect(updated.isLocked).toBe(true);
    expect(updated.documentStatus).toBe("FINAL");
    expect(updated.documentPath).toBeTruthy();
  });

  test("Finalize rejects assigned reviewer who is not the reviewee line manager (no HR bypass)", async () => {
    const review = buildReview();
    ((prisma as any).performanceReview.findUnique as any).mockResolvedValue(review);
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "user_reviewer",
      role: { name: "employee" },
      departmentId: "dept_1",
      department: { name: "HR" },
      employee: null
    });

    await expect(
      PerformanceReviewService.finalizePerformanceReview("review_1", { id: "user_reviewer" })
    ).rejects.toThrow(/line manager|HR leadership/i);
  });

  test("Finalize allowed for reviewee line manager", async () => {
    const review = buildReview();
    ((prisma as any).performanceReview.findUnique as any).mockResolvedValue(review);
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "user_manager",
      role: { name: "employee" },
      departmentId: "dept_1",
      department: { name: "HR" },
      employee: null
    });

    ((prisma as any).performanceReview.update as any).mockImplementation(async ({ data }: any) => ({
      ...review,
      ...data,
      documentPath: data.documentPath
    }));

    const updated = await PerformanceReviewService.finalizePerformanceReview("review_1", { id: "user_manager" });
    expect(updated.isLocked).toBe(true);
  });

  test("PDF download endpoint streams PDF for authorized user", async () => {
    ((prisma as any).performanceReview.findUnique as any).mockResolvedValue(
      buildReview({ documentPath: "C:\\\\tmp\\\\performance-review.pdf" })
    );
    (prisma.user.findUnique as any).mockResolvedValue({
      id: "actor",
      role: { name: "admin" },
      departmentId: "dept_1",
      department: { name: "HR" },
      employee: null
    });

    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    const pipe = jest.fn();
    jest.spyOn(fs, "createReadStream").mockReturnValue({ pipe } as any);

    const req: any = { params: { id: "review_1" }, user: { id: "actor" } };
    const res: any = { setHeader: jest.fn() };

    await PerformanceReviewController.downloadPerformanceReviewPdf(req, res);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(pipe).toHaveBeenCalled();
  });
});

