"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { getEntryFlowState } from "@/components/entry/pidgeot-entry-model";

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

function ConceptIllustration({ stage }) {
  const reducedMotion = useReducedMotion();
  const tokens = [
    { id: "a", label: "promos", offset: "self-start ml-3", driftX: 10, driftY: -3 },
    { id: "b", label: "alerts", offset: "self-end mr-8", driftX: 13, driftY: 2 },
    { id: "c", label: "updates", offset: "self-start ml-12", driftX: 16, driftY: -1 },
    { id: "d", label: "receipts", offset: "self-end mr-2", driftX: 11, driftY: 3 },
    { id: "e", label: "newsletters", offset: "self-start ml-8", driftX: 14, driftY: 1 },
  ];

  const decisionNodes = [
    { id: "keep", label: "keep" },
    { id: "unsubscribe", label: "unsubscribe" },
    { id: "clean-up", label: "clean up" },
  ];

  const settled = stage === "ready";
  const connected = stage === "connect-gmail" || stage === "reauth" || settled;

  return (
    <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,29,0.92),rgba(8,14,25,0.84))] p-8 sm:min-h-[420px]">
      <div className="grid w-full max-w-[520px] grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          {tokens.map((token, index) => (
            <motion.div
              key={token.id}
              data-concept-token={token.label}
              className={classNames(
                "rounded-full bg-[rgba(255,255,255,0.05)] px-3 py-2 text-[11px] font-mono uppercase tracking-[0.16em] text-slate-200",
                token.offset,
              )}
              initial={reducedMotion ? false : { opacity: 0, x: -12 }}
              animate={
                reducedMotion
                  ? { opacity: 1, x: 0, y: 0, scale: 1 }
                  : {
                      opacity: [0.72, 1, 0.84, 1],
                      x: connected ? [0, token.driftX, 2, 0] : [-10, -4, -10],
                      y: connected ? [0, token.driftY, 0] : [0, token.driftY * 0.5, 0],
                      scale: connected ? [0.98, 1.02, 1] : [0.98, 1],
                    }
              }
              transition={{
                duration: reducedMotion ? 0 : connected ? 4.8 : 3.6,
                delay: reducedMotion ? 0 : index * 0.05,
                ease: "easeInOut",
                repeat: reducedMotion ? 0 : Infinity,
                repeatDelay: reducedMotion ? 0 : 0.35,
              }}
            >
              {token.label}
            </motion.div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <motion.div
            className="h-px w-14 bg-cyan-300/24"
            animate={
              reducedMotion
                ? { opacity: connected ? 1 : 0.42, scaleX: connected ? 1 : 0.72 }
                : { opacity: connected ? [0.42, 1, 0.76, 1] : [0.42, 0.6, 0.42], scaleX: connected ? [0.72, 1.08, 1] : [0.72, 0.84, 0.72] }
            }
            transition={{ duration: reducedMotion ? 0 : 3.8, ease: "easeInOut", repeat: reducedMotion ? 0 : Infinity }}
          />
          <motion.div
            data-concept-core="pidgeot"
            className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-[#f4c95d]/10 text-[10px] font-mono uppercase tracking-[0.16em] text-[#fbe9b2]"
            animate={reducedMotion ? { y: 0, scale: 1 } : { y: [-1, 2, -1], scale: connected ? [1, 1.03, 1] : [1, 1.01, 1] }}
            transition={reducedMotion ? { duration: 0 } : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="flex flex-col items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f4c95d]" />
              <span>Pidgeot</span>
            </div>
          </motion.div>
          <motion.div
            className="h-px w-14 bg-[#f4c95d]/24"
            animate={
              reducedMotion
                ? { opacity: connected ? 1 : 0.42, scaleX: connected ? 1 : 0.72 }
                : { opacity: connected ? [0.42, 1, 0.76, 1] : [0.42, 0.6, 0.42], scaleX: connected ? [0.72, 1.08, 1] : [0.72, 0.84, 0.72] }
            }
            transition={{ duration: reducedMotion ? 0 : 3.8, ease: "easeInOut", repeat: reducedMotion ? 0 : Infinity, delay: reducedMotion ? 0 : 0.15 }}
          />
        </div>

        <motion.div
          className="flex min-w-0 flex-col gap-3"
          initial={reducedMotion ? false : { opacity: 0, x: 12 }}
          animate={reducedMotion ? { opacity: connected ? 1 : 0.36, x: connected ? 0 : 10 } : { opacity: connected ? 1 : 0.36, x: connected ? [10, 3, 0] : [10, 8, 10] }}
          transition={{ duration: reducedMotion ? 0 : 1.1, delay: reducedMotion ? 0 : 0.1, ease: "easeOut" }}
        >
          {decisionNodes.map((node, index) => (
            <motion.div
              key={node.id}
              data-concept-outcome={node.label}
              className="w-fit rounded-full bg-[#f4c95d]/10 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.14em] text-[#fbe9b2]"
              animate={
                reducedMotion
                  ? { opacity: connected ? 1 : 0.42, y: 0 }
                  : { opacity: connected ? [0.42, 1] : [0.42, 0.54, 0.42], y: connected ? [6, 0] : [0, 1, 0] }
              }
              transition={{
                duration: reducedMotion ? 0 : connected ? 0.75 : 2.8,
                delay: reducedMotion ? 0 : connected ? 0.18 + index * 0.08 : index * 0.05,
                ease: "easeOut",
                repeat: reducedMotion || connected ? 0 : Infinity,
                repeatDelay: reducedMotion || connected ? 0 : 0.25,
              }}
            >
              {node.label}
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="absolute bottom-5 left-5 right-5 grid gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 sm:grid-cols-3">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Inbox chaos</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Pidgeot</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Your decision</span>
      </div>
    </div>
  );
}

function PrimaryAction({ action, onReadyAdvance }) {
  if (!action) {
    return null;
  }

  if (action.kind === "button") {
    return (
      <button
        className="inline-flex items-center justify-center rounded-full bg-[#f4c95d] px-5 py-3 text-sm font-semibold text-slate-950 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4c95d]"
        onClick={onReadyAdvance}
        type="button"
      >
        {action.label}
      </button>
    );
  }

  return (
    <form action={action.action} method="post">
      <button
        className="inline-flex items-center justify-center rounded-full bg-[#f4c95d] px-5 py-3 text-sm font-semibold text-slate-950 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4c95d]"
        type="submit"
      >
        {action.label}
      </button>
    </form>
  );
}

function SecondaryActions({ email, ready }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
      <form action="/api/auth/logout" method="post">
        <button
          className="rounded-full border border-white/12 bg-white/4 px-4 py-2 font-semibold text-white transition-colors duration-200 hover:border-white/28 hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          type="submit"
        >
          Sign out
        </button>
      </form>
      {email ? <span className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">{email}</span> : null}
      {!ready ? (
        <div className="flex gap-3 text-sm text-slate-400">
          <Link className="hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href="/security">
            Security
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function PidgeotEntryScreen({ authConfigured, email, gmailAuthState }) {
  const reducedMotion = useReducedMotion();
  const [enteredReadyShell, setEnteredReadyShell] = useState(false);
  const flow = getEntryFlowState({ authConfigured, email, gmailAuthState });
  const readyShell = flow.stage === "ready";
  const configState = flow.stage === "config";
  const publicState = flow.stage === "public";

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-6xl items-center">
      <section className="grid gap-6 rounded-[32px] border border-white/12 bg-[rgba(7,11,19,0.84)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-6 xl:grid-cols-[1.08fr_0.92fr] xl:items-center">
        <motion.section
          initial={reducedMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.28 }}
          className="space-y-6"
        >
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/22 bg-cyan-300/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.28em] text-cyan-100">
              Meet Pidgeot
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl leading-none font-semibold tracking-[-0.05em] text-white sm:text-6xl">
                {configState || !publicState ? flow.title : "Your inbox remembers every subscription you've ever made."}
              </h1>
              {configState || !publicState ? (
                <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{flow.description}</p>
              ) : (
                <>
                  <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                    Some you chose. Some you forgot about. Some you never meant to keep.
                  </p>
                  <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                    Pidgeot finds the recurring senders hiding in your Gmail and puts you back in control.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <PrimaryAction action={flow.primaryAction} onReadyAdvance={() => setEnteredReadyShell(true)} />
            {!email ? (
              <Link
                className="inline-flex items-center justify-center rounded-full border border-white/14 px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/30 hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                href="/privacy"
              >
                Privacy notes
              </Link>
            ) : null}
          </div>

          <p className="max-w-2xl text-sm leading-6 text-slate-400">{flow.supportingText}</p>

          <div className="flex flex-wrap gap-3 text-sm text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/4 px-3 py-2">Groups recurring senders</span>
            <span className="rounded-full border border-white/10 bg-white/4 px-3 py-2">Lets you choose the cleanup</span>
            <span className="rounded-full border border-white/10 bg-white/4 px-3 py-2">Built for a privacy-first workflow</span>
          </div>

          {email ? <SecondaryActions email={email} ready={readyShell} /> : null}

          <AnimatePresence initial={false}>
            {readyShell && enteredReadyShell ? (
              <motion.div
                key="ready-handoff"
                className="rounded-[24px] border border-cyan-300/22 bg-cyan-300/10 px-4 py-4 text-sm text-cyan-100"
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
              >
                You’re in. The inbox scan is the next step from here.
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.section>

        <motion.aside
          initial={reducedMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.32, delay: reducedMotion ? 0 : 0.05 }}
          className="grid gap-4"
        >
          <ConceptIllustration stage={flow.stage} />
          <div className="rounded-[28px] border border-white/10 bg-[rgba(8,14,25,0.86)] p-5">
            <p className="text-sm leading-7 text-slate-300">
              Pidgeot finds the senders filling your inbox, groups the noise, and gives you simple choices: keep, unsubscribe, or clean up.
            </p>
          </div>
        </motion.aside>
      </section>
    </div>
  );
}