/**

 * UAT — LP Portal Socket.IO realtime (notices, requests, messages).

 * DEV nts only. Requires running API (npm run dev).

 *

 * npm run uat:lp-portal:realtime

 */

// @ts-nocheck

import "dotenv/config";

import { io } from "socket.io-client";

import { PrismaClient } from "@prisma/client";

import {

  BASE,

  api,

  assertDevDatabase,

  ensureSeed,

  loadSeedIds,

  log,

  resolveSignatoryToken,

  resolveViewerToken,

  summarizeFail,

} from "./lib/lp-portal-uat-helpers";



const prisma = new PrismaClient();

const results: Array<{ step: string; ok: boolean; detail: string }> = [];



function record(step: string, ok: boolean, detail: string) {

  results.push({ step, ok, detail });

  log(step, ok, detail);

}



function socketOrigin() {

  return BASE.replace(/\/api\/?$/, "");

}



function waitForEvent(socket: any, event: string, timeoutMs = 15000): Promise<any> {

  return new Promise((resolve) => {

    const timer = setTimeout(() => resolve(null), timeoutMs);

    socket.once(event, (payload: any) => {

      clearTimeout(timer);

      resolve(payload);

    });

  });

}



async function connectSocket(token: string, label: string) {

  const socket = io(socketOrigin(), {

    path: "/socket.io",

    auth: { token },

    transports: ["websocket"],

  });

  await new Promise<void>((resolve, reject) => {

    const t = setTimeout(() => reject(new Error(`${label} socket connect timeout`)), 15000);

    socket.on("connect", () => {

      clearTimeout(t);

      resolve();

    });

    socket.on("connect_error", (e: Error) => {

      clearTimeout(t);

      reject(e);

    });

  });

  socket.emit("join_lp_portal");

  return socket;

}



async function main() {

  console.log(`LP Portal realtime UAT — ${socketOrigin()}\n`);

  await ensureSeed(prisma);

  await assertDevDatabase(prisma, "uat:lp-portal:realtime");



  const ids = await loadSeedIds(prisma);

  const token = await resolveSignatoryToken();

  const viewerToken = await resolveViewerToken();



  const contract = await api("GET", "/lp-portal/realtime", token);

  record(

    "realtime.contract",

    contract.status === 200 && contract.json?.data?.transport === "socket.io",

    `transport=${contract.json?.data?.transport}`

  );



  const socket = await connectSocket(token, "signatory");

  record("realtime.connect", socket.connected, `id=${socket.id}`);



  const viewerSocket = await connectSocket(viewerToken, "viewer");

  record("realtime.viewer-connect", viewerSocket.connected, `id=${viewerSocket.id}`);



  // --- Notices ---

  const noticePromise = waitForEvent(socket, "lp_notice_updated");

  const notices = await api("GET", "/lp-portal/notices?pageSize=5", token);

  const unacked = (notices.json?.data?.items || []).find(

    (n: any) => n.status !== "ACKNOWLEDGED"

  );

  if (unacked?.id) {

    await api("GET", `/lp-portal/notices/${unacked.id}`, token);

    const evt = await noticePromise;

    record(

      "realtime.notice-updated",

      Boolean(evt?.noticeId === unacked.id),

      evt ? `status=${evt.status}` : "timeout"

    );

  } else {

    noticePromise.then(() => {});

    record("realtime.notice-updated", true, "skipped — all notices acked");

  }



  // --- Requests ---

  const reqPromise = waitForEvent(socket, "lp_request_created");

  const notifPromise = waitForEvent(viewerSocket, "lp_notification");



  const create = await api(

    "POST",

    "/lp-portal/requests",

    token,

    {

      type: "CAPITAL_ACTIVITY",

      fundId: ids.fundPcId,

      subject: "Realtime UAT request",

      description: "Socket test",

      priority: "NORMAL",

    },

    { "Idempotency-Key": `uat-rt-req-${Date.now()}` }

  );

  const ref = create.json?.data?.reference;

  socket.emit("join_lp_request", { reference: ref });



  const reqEvt = await reqPromise;

  record(

    "realtime.request-created",

    create.status === 201 && reqEvt?.reference === ref,

    `ref=${ref} event=${Boolean(reqEvt)} status=${create.status}`

  );



  const msgPromise = waitForEvent(socket, "lp_request_message");

  if (ref) {

    await api("POST", `/lp-portal/requests/${ref}/messages`, token, {

      body: "Realtime follow-up",

    });

    const msgEvt = await msgPromise;

    record(

      "realtime.request-message",

      Boolean(msgEvt?.reference === ref),

      msgEvt ? "received" : "timeout"

    );

  } else {

    msgPromise.then(() => {});

    record("realtime.request-message", false, "no reference");

  }



  const notifEvt = await notifPromise;

  record(

    "realtime.lp-notification",

    Boolean(notifEvt?.href || notifEvt?.title),

    notifEvt ? `type=${notifEvt.type}` : "timeout"

  );



  // --- Message threads ---

  const threads = await api("GET", "/lp-portal/messages?pageSize=1", token);

  const threadId = threads.json?.data?.items?.[0]?.id || ids.messageThreadId;

  if (threadId) {

    viewerSocket.emit("join_lp_thread", { threadId });

    const threadMsgPromise = waitForEvent(viewerSocket, "lp_thread_message");

    const reply = await api("POST", `/lp-portal/messages/${threadId}/replies`, token, {

      body: "Realtime thread reply UAT",

    });

    const threadEvt = await threadMsgPromise;

    record(

      "realtime.thread-message",

      reply.status === 201 && threadEvt?.threadId === threadId,

      threadEvt ? "received" : "timeout"

    );

  } else {

    record("realtime.thread-message", true, "skipped — no threads");

  }



  socket.disconnect();

  viewerSocket.disconnect();



  const passed = results.filter((r) => r.ok).length;

  const failed = results.filter((r) => !r.ok);

  console.log(`\n--- ${passed}/${results.length} PASS ---`);

  if (failed.length) summarizeFail(failed);

  process.exit(failed.length ? 1 : 0);

}



main()

  .catch((e) => {

    console.error(e);

    process.exit(1);

  })

  .finally(async () => {

    await prisma.$disconnect();

  });


