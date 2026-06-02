/**
 * Payroll module OpenAPI paths (fallback when route JSDoc is missing).
 * Server base URL already includes `/api` — paths are `/payroll/...`.
 */

const TAG = "Payroll - Employees";

const createEmployeeMultipartSchema = {
  type: "object",
  required: ["userId", "basicSalary"],
  properties: {
    userId: {
      type: "string",
      description: "Select User — existing `users.id` (CUID)",
      example: "cmislgonq0001unfkpukqyiah",
    },
    bankName: {
      type: "string",
      description: "Bank Name",
      example: "Standard Bank",
    },
    branchCode: {
      type: "string",
      description: "Branch Code",
      example: "001",
    },
    accountNumber: {
      type: "string",
      description: "Account Number",
      example: "1234567890",
    },
    basicSalary: {
      type: "string",
      description: "Basic Salary (number or numeric string in form-data)",
      example: "4500",
    },
    currencyId: {
      type: "string",
      description: "Currency — `currencies.id` (from GET /currencies), not display name",
      example: "cmh3bymy70000una4yk8leusu",
    },
    idNumber: {
      type: "string",
      description: "ID Number",
      example: "38-2024495Q38",
    },
    nextOfKin: {
      type: "string",
      description: "Next of Kin",
      example: "Kundai",
    },
    nextOfKinContact: {
      type: "string",
      description: "Next of Kin contact (phone/email) — optional, not on all UIs",
      example: "+263771234567",
    },
    address: {
      type: "string",
      description: "Address",
      example: "Dan Judson Rd, Harare",
    },
    picture: {
      type: "string",
      format: "binary",
      description:
        "Profile photo file (replaces Picture URL text box). Field name must be exactly `picture`. Max 10MB.",
    },
    pictureUrl: {
      type: "string",
      description:
        "Only if NOT uploading `picture` — pre-hosted image URL (legacy text field)",
      example: "https://example.com/photo.jpg",
    },
    bscNewHireCounterGoalId: {
      type: "string",
      description: "Optional BSC new-hire performance goal id",
    },
  },
};

const updateEmployeeMultipartSchema = {
  type: "object",
  properties: {
    bankName: { type: "string", example: "Standard Bank" },
    branchCode: { type: "string", example: "001" },
    accountNumber: { type: "string", example: "1234567890" },
    basicSalary: {
      type: "string",
      description: "Basic Salary (number or numeric string in form-data)",
      example: "4500",
    },
    currencyId: {
      type: "string",
      description: "Currency — `currencies.id`",
      example: "cmh3bymy70000una4yk8leusu",
    },
    idNumber: { type: "string", example: "38-2024495Q38" },
    nextOfKin: { type: "string", example: "Kundai" },
    nextOfKinContact: { type: "string", example: "+263771234567" },
    address: { type: "string", example: "Dan Judson Rd, Harare" },
    isActive: {
      type: "string",
      description:
        "Set to `false` to deactivate (terminates employee). Omit or `true` for normal field updates.",
      example: "true",
    },
    picture: {
      type: "string",
      format: "binary",
      description:
        "New profile photo file. Field name must be exactly `picture`. Max 10MB. Omit to keep existing photo.",
    },
    pictureUrl: {
      type: "string",
      description:
        "On update: include this field always when the photo section was shown. Empty string = remove photo. Non-empty = keep/set URL. Omit only when other fields change and photo is unchanged.",
      example: "https://example.com/photo.jpg",
    },
  },
};

const employeeResponseSchema = {
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    message: { type: "string", example: "Employee created successfully" },
    data: {
      type: "object",
      properties: {
        id: { type: "string" },
        userId: { type: "string" },
        employeeNumber: { type: "string", example: "EMP042" },
        bankName: { type: "string", nullable: true },
        branchCode: { type: "string", nullable: true },
        accountNumber: { type: "string", nullable: true },
        basicSalary: { type: "number" },
        currencyId: { type: "string", nullable: true },
        idNumber: { type: "string", nullable: true },
        nextOfKin: { type: "string", nullable: true },
        nextOfKinContact: { type: "string", nullable: true },
        address: { type: "string", nullable: true },
        pictureUrl: {
          type: "string",
          nullable: true,
          description: "Profile photo URL (browser-ready)",
        },
        picture: {
          type: "string",
          nullable: true,
          description: "Same as pictureUrl — for payroll UI",
        },
        user: {
          type: "object",
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string" },
          },
        },
        currency: { type: "object", nullable: true },
      },
    },
  },
};

export const payrollEndpoints: Record<string, Record<string, unknown>> = {
  "/payroll/employees": {
    post: {
      tags: [TAG],
      summary: "Create employee (multipart/form-data)",
      description:
        "Matches the **Create Employee** payroll form.\n\n" +
        "**Postman:** Body → **form-data** (not raw JSON). Auth → Bearer token.\n\n" +
        "| Form label | Field name | Type |\n" +
        "|------------|------------|------|\n" +
        "| Select User | `userId` | Text |\n" +
        "| Bank Name | `bankName` | Text |\n" +
        "| Branch Code | `branchCode` | Text |\n" +
        "| Account Number | `accountNumber` | Text |\n" +
        "| Basic Salary | `basicSalary` | Text |\n" +
        "| Currency | `currencyId` | Text (currency **id**) |\n" +
        "| ID Number | `idNumber` | Text |\n" +
        "| Next of Kin | `nextOfKin` | Text |\n" +
        "| Address | `address` | Text |\n" +
        "| Photo | `picture` | **File** |\n\n" +
        "Server auto-generates `employeeNumber` (EMP001, …). Response includes `data.pictureUrl` after upload.",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: createEmployeeMultipartSchema,
            encoding: {
              picture: {
                contentType: "image/png, image/jpeg, image/jpg, image/webp, image/gif",
              },
            },
          },
          "application/json": {
            schema: {
              type: "object",
              required: ["userId", "basicSalary"],
              properties: {
                userId: { type: "string", example: "cmislgonq0001unfkpukqyiah" },
                bankName: { type: "string", example: "Standard Bank" },
                branchCode: { type: "string", example: "001" },
                accountNumber: { type: "string", example: "1234567890" },
                basicSalary: { type: "number", example: 4500 },
                currencyId: { type: "string", example: "cmh3bymy70000una4yk8leusu" },
                idNumber: { type: "string", example: "38-2024495Q38" },
                nextOfKin: { type: "string", example: "Kundai" },
                nextOfKinContact: { type: "string", example: "+263771234567" },
                address: { type: "string", example: "Dan Judson Rd" },
                pictureUrl: { type: "string", nullable: true },
                bscNewHireCounterGoalId: { type: "string" },
              },
            },
            description: "Legacy — no file upload; use `pictureUrl` string only",
          },
        },
      },
      responses: {
        201: {
          description: "Employee created",
          content: { "application/json": { schema: employeeResponseSchema } },
        },
        400: { description: "Validation, duplicate employee, or picture upload failed" },
        401: { description: "Unauthorized" },
        404: { description: "User not found" },
        500: { description: "Server error" },
      },
    },
    get: {
      tags: [TAG],
      summary: "List active employees",
      description:
        "Returns non-terminated, active payroll employees. Each item includes **`pictureUrl`** and **`picture`** (same public URL for the profile photo).",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "array",
                    items: {
                      allOf: [
                        {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            userId: { type: "string" },
                            employeeNumber: { type: "string" },
                            bankName: { type: "string", nullable: true },
                            branchCode: { type: "string", nullable: true },
                            accountNumber: { type: "string", nullable: true },
                            basicSalary: { type: "number" },
                            currencyId: { type: "string", nullable: true },
                            idNumber: { type: "string", nullable: true },
                            nextOfKin: { type: "string", nullable: true },
                            nextOfKinContact: { type: "object", nullable: true },
                            address: { type: "string", nullable: true },
                            pictureUrl: {
                              type: "string",
                              nullable: true,
                              description: "Profile photo URL (browser-ready)",
                            },
                            picture: {
                              type: "string",
                              nullable: true,
                              description: "Same as pictureUrl — for payroll UI",
                            },
                            isActive: { type: "boolean" },
                            terminated: { type: "boolean" },
                            user: { type: "object" },
                            currency: { type: "object", nullable: true },
                            reimbursementVendor: { type: "object", nullable: true },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "/payroll/employees/{id}": {
    put: {
      tags: [TAG],
      summary: "Update employee (multipart/form-data)",
      description:
        "Matches the **Edit Employee** payroll form — same upload pattern as create.\n\n" +
        "**Postman:** Body → **form-data** (not raw JSON). Auth → Bearer token.\n\n" +
        "| Form label | Field name | Type |\n" +
        "|------------|------------|------|\n" +
        "| Bank Name | `bankName` | Text |\n" +
        "| Branch Code | `branchCode` | Text |\n" +
        "| Account Number | `accountNumber` | Text |\n" +
        "| Basic Salary | `basicSalary` | Text |\n" +
        "| Currency | `currencyId` | Text (currency **id**) |\n" +
        "| ID Number | `idNumber` | Text |\n" +
        "| Next of Kin | `nextOfKin` | Text |\n" +
        "| Next of Kin contact | `nextOfKinContact` | Text |\n" +
        "| Address | `address` | Text |\n" +
        "| Active | `isActive` | Text (`true` / `false`) |\n" +
        "| Photo | `picture` | **File** (optional — new upload) |\n" +
        "| Picture URL | `pictureUrl` | Text — current URL to keep; **empty string** to remove photo |\n\n" +
        "Photo rule on update: send `pictureUrl` empty when the user removed the image; send the existing URL when keeping it; upload `picture` when replacing with a new file.",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Employee id (CUID)",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: updateEmployeeMultipartSchema,
            encoding: {
              picture: {
                contentType: "image/png, image/jpeg, image/jpg, image/webp, image/gif",
              },
            },
          },
          "application/json": {
            schema: {
              type: "object",
              properties: {
                bankName: { type: "string" },
                branchCode: { type: "string" },
                accountNumber: { type: "string" },
                basicSalary: { type: "number" },
                currencyId: { type: "string" },
                idNumber: { type: "string" },
                nextOfKin: { type: "string" },
                nextOfKinContact: { type: "string" },
                address: { type: "string" },
                isActive: { type: "boolean" },
                pictureUrl: { type: "string", nullable: true },
              },
            },
            description: "Legacy — no file upload; use `pictureUrl` string only",
          },
        },
      },
      responses: {
        200: {
          description: "Employee updated (or deactivated when isActive is false)",
          content: { "application/json": { schema: employeeResponseSchema } },
        },
        400: { description: "Validation, terminated employee, or picture upload failed" },
        401: { description: "Unauthorized" },
        404: { description: "Employee not found" },
        500: { description: "Server error" },
      },
    },
  },
};
