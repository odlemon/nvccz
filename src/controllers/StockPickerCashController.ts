// @ts-nocheck
import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import {
  getIdempotencyKey,
  sendInvestmentOpsError,
} from "../middleware/investmentOpsFoundation";
import {
  SpCashAccountService,
  SpCashBrokerCustodianService,
  SpCashCloseService,
  SpCashExceptionService,
  SpCashImportService,
  SpCashJournalService,
  SpCashMatchingService,
  SpCashPositionService,
  SpCashReservationService,
  SpCashSetupService,
  SpCashStatementService,
} from "../services/stockPickerCash";

function handle(res: Response, promise: Promise<unknown>, successStatus = 200) {
  promise
    .then((data) => res.status(successStatus).json({ success: true, data }))
    .catch((e: any) => sendInvestmentOpsError(res, e));
}

function optionalIdempotency(req: AuthRequest): string | undefined {
  try {
    return getIdempotencyKey(req);
  } catch {
    return (req.headers["idempotency-key"] as string) || req.body?.idempotencyKey || undefined;
  }
}

function requireIdempotency(req: AuthRequest): string {
  return getIdempotencyKey(req);
}

/**
 * Stock Picker Cash controller — flat `/api/investment-ops/*` paths (SRD §14).
 */
export class StockPickerCashController {
  // ─── 14.1 Client cash accounts ───────────────────────────────────────────
  static listAccounts(req: AuthRequest, res: Response) {
    handle(res, SpCashAccountService.list(req.query));
  }

  static createAccount(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashAccountService.create(req.body, req.user!.id, optionalIdempotency(req)),
      201
    );
  }

  static getAccount(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashAccountService.get(req.params.accountId, {
        clientOrVehicleId: req.query.clientOrVehicleId as string,
        tenantId: req.query.tenantId as string,
      })
    );
  }

  static submitAccount(req: AuthRequest, res: Response) {
    handle(res, SpCashAccountService.submit(req.params.accountId, req.body, req.user!.id));
  }

  static approveAccount(req: AuthRequest, res: Response) {
    handle(res, SpCashAccountService.approve(req.params.accountId, req.body, req.user!.id));
  }

  static rejectAccount(req: AuthRequest, res: Response) {
    handle(res, SpCashAccountService.reject(req.params.accountId, req.body, req.user!.id));
  }

  static suspendAccount(req: AuthRequest, res: Response) {
    handle(res, SpCashAccountService.suspend(req.params.accountId, req.body, req.user!.id));
  }

  static closeAccount(req: AuthRequest, res: Response) {
    handle(res, SpCashAccountService.close(req.params.accountId, req.body, req.user!.id));
  }

  // ─── 14.2 Cash position & overview ───────────────────────────────────────
  static cashPosition(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashPositionService.cashPosition({
        ...req.query,
        portfolioId: req.params.portfolioId,
      })
    );
  }

  static cashExplanation(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashPositionService.cashExplanation({
        ...req.query,
        portfolioId: req.params.portfolioId,
      })
    );
  }

  static cashProjection(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashPositionService.cashProjection({
        ...req.query,
        portfolioId: req.params.portfolioId,
      })
    );
  }

  static cashOverview(req: AuthRequest, res: Response) {
    handle(res, SpCashPositionService.cashOverview(req.query));
  }

  static cashDailyMovement(req: AuthRequest, res: Response) {
    handle(res, SpCashPositionService.dailyMovement(req.query));
  }

  // ─── 14.3 Reservations ───────────────────────────────────────────────────
  static listReservations(req: AuthRequest, res: Response) {
    handle(res, SpCashReservationService.list(req.query));
  }

  static createReservation(req: AuthRequest, res: Response) {
    let key: string;
    try {
      key = requireIdempotency(req);
    } catch (e) {
      return sendInvestmentOpsError(res, e);
    }
    handle(res, SpCashReservationService.create(req.body, req.user!.id, key), 201);
  }

  static approveReservation(req: AuthRequest, res: Response) {
    handle(res, SpCashReservationService.approve(req.params.id, req.body, req.user!.id));
  }

  static consumeReservation(req: AuthRequest, res: Response) {
    handle(res, SpCashReservationService.consume(req.params.id, req.body, req.user!.id));
  }

  static releaseReservation(req: AuthRequest, res: Response) {
    handle(res, SpCashReservationService.release(req.params.id, req.body, req.user!.id));
  }

  // ─── 14.4 Ledger & journals ──────────────────────────────────────────────
  static listLedger(req: AuthRequest, res: Response) {
    handle(res, SpCashJournalService.listLedger(req.query));
  }

  static createJournal(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashJournalService.create(req.body, req.user!.id, optionalIdempotency(req)),
      201
    );
  }

  static getJournal(req: AuthRequest, res: Response) {
    handle(res, SpCashJournalService.get(req.params.id));
  }

  static submitJournal(req: AuthRequest, res: Response) {
    handle(res, SpCashJournalService.submit(req.params.id, req.body, req.user!.id));
  }

  static approveJournal(req: AuthRequest, res: Response) {
    handle(res, SpCashJournalService.approve(req.params.id, req.body, req.user!.id, req.user));
  }

  static rejectJournal(req: AuthRequest, res: Response) {
    handle(res, SpCashJournalService.reject(req.params.id, req.body, req.user!.id));
  }

  static reverseJournal(req: AuthRequest, res: Response) {
    handle(res, SpCashJournalService.reverse(req.params.id, req.body, req.user!.id));
  }

  // ─── 14.5 External statement imports ─────────────────────────────────────
  static createImport(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashImportService.create(req.body, req.user!.id, optionalIdempotency(req)),
      201
    );
  }

  static ingestImport(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashImportService.ingestAndCommit(
        req.body,
        req.user!.id,
        req.user,
        optionalIdempotency(req)
      ),
      201
    );
  }

  static getImport(req: AuthRequest, res: Response) {
    handle(res, SpCashImportService.get(req.params.id));
  }

  static importErrors(req: AuthRequest, res: Response) {
    handle(res, SpCashImportService.errors(req.params.id));
  }

  static validateImport(req: AuthRequest, res: Response) {
    handle(res, SpCashImportService.validate(req.params.id, req.body, req.user!.id));
  }

  static submitImport(req: AuthRequest, res: Response) {
    handle(res, SpCashImportService.submit(req.params.id, req.body, req.user!.id));
  }

  static commitImport(req: AuthRequest, res: Response) {
    handle(res, SpCashImportService.commit(req.params.id, req.body, req.user!.id, req.user));
  }

  static rejectImport(req: AuthRequest, res: Response) {
    handle(res, SpCashImportService.reject(req.params.id, req.body, req.user!.id, req.user));
  }

  // ─── 14.6 Reconciliation batches ─────────────────────────────────────────
  static createReconBatch(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashMatchingService.createBatch(req.body, req.user!.id, optionalIdempotency(req)),
      201
    );
  }

  static listReconBatches(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.list(req.query));
  }

  static getReconBatch(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.get(req.params.id));
  }

  static deleteReconBatch(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.deleteBatch(req.params.id, req.user!.id));
  }

  static runReconBatch(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.run(req.params.id, req.body, req.user!.id));
  }

  static reconWorkspace(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.workspace(req.params.id));
  }

  static reconSummary(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.summary(req.params.id));
  }

  static autoMatch(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.autoMatch(req.params.id, req.body, req.user!.id));
  }

  static activeRules(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.activeRules());
  }

  static fundCashSummary(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.fundCashSummary(req.query));
  }

  // ─── 14.7 Matches ────────────────────────────────────────────────────────
  static confirmMatch(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.confirm(req.body, req.user!.id));
  }

  static manualMatch(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.manual(req.body, req.user!.id));
  }

  static getMatch(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.getMatch(req.params.linkId));
  }

  static reverseMatch(req: AuthRequest, res: Response) {
    handle(res, SpCashMatchingService.reverseMatch(req.params.linkId, req.body, req.user!.id));
  }

  /** Body-based unmatch: { linkId } or { internalLineId, externalLineId }. */
  static reverseMatchBody(req: AuthRequest, res: Response) {
    const linkId =
      req.body?.linkId || req.body?.matchId || req.body?.id || req.params.linkId || "";
    handle(res, SpCashMatchingService.reverseMatch(String(linkId), req.body, req.user!.id));
  }

  // ─── 14.8 Broker & custodian ─────────────────────────────────────────────
  static brokerCustodianWorkspace(req: AuthRequest, res: Response) {
    handle(res, SpCashBrokerCustodianService.workspace(req.query));
  }

  static brokerCustodianConfirm(req: AuthRequest, res: Response) {
    handle(res, SpCashBrokerCustodianService.confirmMatch(req.body, req.user!.id));
  }

  static brokerCustodianEscalate(req: AuthRequest, res: Response) {
    handle(res, SpCashBrokerCustodianService.escalate(req.params.id, req.body, req.user!.id));
  }

  static brokerCustodianClear(req: AuthRequest, res: Response) {
    handle(res, SpCashBrokerCustodianService.clear(req.params.id, req.body, req.user!.id));
  }

  // ─── 14.9 Exceptions ─────────────────────────────────────────────────────
  static listExceptions(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.list(req.query));
  }

  static exceptionsSummary(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.summary(req.query));
  }

  static getException(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.get(req.params.id));
  }

  static exceptionTimeline(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.timeline(req.params.id));
  }

  static listExceptionComments(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.listComments(req.params.id));
  }

  static addExceptionComment(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.addComment(req.params.id, req.body, req.user!.id), 201);
  }

  static listExceptionAttachments(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.listAttachments(req.params.id));
  }

  static addExceptionAttachment(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.addAttachment(req.params.id, req.body, req.user!.id), 201);
  }

  static exceptionAudit(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.audit(req.params.id));
  }

  static assignException(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.assign(req.params.id, req.body, req.user!.id));
  }

  static investigateException(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.investigate(req.params.id, req.body, req.user!.id));
  }

  static proposeException(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.propose(req.params.id, req.body, req.user!.id));
  }

  static approveException(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.approve(req.params.id, req.body, req.user!.id, req.user));
  }

  static requestInfoException(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.requestInfo(req.params.id, req.body, req.user!.id));
  }

  static rejectException(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.reject(req.params.id, req.body, req.user!.id, req.user));
  }

  static closeException(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.close(req.params.id, req.body, req.user!.id));
  }

  static reopenException(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.reopen(req.params.id, req.body, req.user!.id));
  }

  // ─── 14.10 Break actions ─────────────────────────────────────────────────
  static getBreak(req: AuthRequest, res: Response) {
    handle(res, SpCashExceptionService.getBreak(req.params.breakId));
  }

  static adjustInternalBreak(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashExceptionService.adjustInternal(req.params.breakId, req.body, req.user!.id)
    );
  }

  static markBreakReviewed(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashExceptionService.markReviewed(req.params.breakId, req.body, req.user!.id)
    );
  }

  static createManualEntryBreak(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashExceptionService.createManualEntry(req.params.breakId, req.body, req.user!.id)
    );
  }

  static commentBreak(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashExceptionService.addBreakComment(req.params.breakId, req.body, req.user!.id),
      201
    );
  }

  // ─── 14.11 Period close & GL export ──────────────────────────────────────
  static periodPrecheck(req: AuthRequest, res: Response) {
    handle(res, SpCashCloseService.precheck(req.params.period, req.body));
  }

  static periodClose(req: AuthRequest, res: Response) {
    handle(res, SpCashCloseService.close(req.params.period, req.body, req.user!.id));
  }

  static periodReopenRequest(req: AuthRequest, res: Response) {
    handle(res, SpCashCloseService.reopenRequest(req.params.period, req.body, req.user!.id));
  }

  static periodRestate(req: AuthRequest, res: Response) {
    handle(res, SpCashCloseService.restate(req.params.period, req.body, req.user!.id));
  }

  static createGlExport(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashCloseService.createGlExport(req.body, req.user!.id, optionalIdempotency(req)),
      201
    );
  }

  static getGlExport(req: AuthRequest, res: Response) {
    handle(res, SpCashCloseService.getGlExport(req.params.id));
  }

  static retryGlExport(req: AuthRequest, res: Response) {
    handle(res, SpCashCloseService.retryGlExport(req.params.id, req.body, req.user!.id));
  }

  // ─── 14.12 Client statements ─────────────────────────────────────────────
  static listStatements(req: AuthRequest, res: Response) {
    handle(res, SpCashStatementService.list(req.query));
  }

  static statementsSummary(req: AuthRequest, res: Response) {
    handle(res, SpCashStatementService.summary(req.query));
  }

  static generateStatement(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashStatementService.generate(req.body, req.user!.id, optionalIdempotency(req)),
      201
    );
  }

  static getStatement(req: AuthRequest, res: Response) {
    handle(res, SpCashStatementService.get(req.params.id));
  }

  static previewStatement(req: AuthRequest, res: Response) {
    handle(res, SpCashStatementService.preview(req.params.id));
  }

  static approveStatement(req: AuthRequest, res: Response) {
    handle(res, SpCashStatementService.approve(req.params.id, req.body, req.user!.id));
  }

  static emailStatement(req: AuthRequest, res: Response) {
    handle(res, SpCashStatementService.email(req.params.id, req.body, req.user!.id));
  }

  static downloadStatement(req: AuthRequest, res: Response) {
    SpCashStatementService.download(req.params.id, req.headers.accept as string | undefined)
      .then((data: any) => {
        if (data?.mode === "binary" && data.buffer) {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${String(data.fileName || "statement.pdf").replace(/"/g, "")}"`
          );
          res.setHeader("Content-Length", String(data.buffer.length));
          return res.status(200).send(data.buffer);
        }
        const { mode, buffer, ...rest } = data || {};
        return res.status(200).json({ success: true, data: rest });
      })
      .catch((e: any) => sendInvestmentOpsError(res, e));
  }

  // ─── 14.13 Setup ─────────────────────────────────────────────────────────
  static listProviders(req: AuthRequest, res: Response) {
    handle(res, SpCashSetupService.listProviders(req.query));
  }
  static createProvider(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashSetupService.createProvider(req.body, req.user!.id, optionalIdempotency(req)),
      201
    );
  }

  static listFileLayouts(req: AuthRequest, res: Response) {
    handle(res, SpCashSetupService.listFileLayouts(req.query));
  }
  static createFileLayout(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashSetupService.createFileLayout(req.body, req.user!.id, optionalIdempotency(req)),
      201
    );
  }

  static listAccountMappings(req: AuthRequest, res: Response) {
    handle(res, SpCashSetupService.listAccountMappings(req.query));
  }
  static createAccountMapping(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashSetupService.createAccountMapping(req.body, req.user!.id, optionalIdempotency(req)),
      201
    );
  }

  static listTolerancePolicies(req: AuthRequest, res: Response) {
    handle(res, SpCashSetupService.listTolerancePolicies(req.query));
  }
  static createTolerancePolicy(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashSetupService.createTolerancePolicy(req.body, req.user!.id, optionalIdempotency(req)),
      201
    );
  }

  static listMatchWeightPolicies(req: AuthRequest, res: Response) {
    handle(res, SpCashSetupService.listMatchWeightPolicies(req.query));
  }
  static createMatchWeightPolicy(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashSetupService.createMatchWeightPolicy(req.body, req.user!.id, optionalIdempotency(req)),
      201
    );
  }

  static activateSetup(req: AuthRequest, res: Response) {
    handle(
      res,
      SpCashSetupService.activate(
        req.params.resource as any,
        req.params.id,
        req.body,
        req.user!.id
      )
    );
  }
}
