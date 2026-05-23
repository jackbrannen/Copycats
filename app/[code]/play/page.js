"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"

const BG         = "#5C2D8C"
const YELLOW     = "#FBDF54"
const DARK       = "#3D1A70"
const MID        = "#4A228C"
const WARM_LIGHT = "#7A3AAA"
const GREEN      = "#12BAAA"

// ─── helpers ────────────────────────────────────────────────────────────────

function Section({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function TopBar({ children }) {
  return (
    <div style={{ background: DARK, padding: "12px 20px", fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
      {children}
    </div>
  )
}

function BigQuestion({ question }) {
  return (
    <div style={{ background: MID, padding: "20px 20px", borderLeft: `4px solid ${YELLOW}` }}>
      <p style={{ fontSize: 20, fontWeight: 700, color: "white", lineHeight: 1.4 }}>
        "{question}"
      </p>
    </div>
  )
}

function PrimaryBtn({ onClick, disabled, loading, label, loadingLabel }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{ background: YELLOW, color: "#000", fontSize: 20, fontWeight: 900, padding: "20px", width: "100%" }}
    >
      {loading ? loadingLabel : label}
    </button>
  )
}

function SecondaryBtn({ onClick, disabled, children, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ background: WARM_LIGHT, color: "white", fontSize: 18, fontWeight: 700, padding: "16px", width: "100%", ...style }}
    >
      {children}
    </button>
  )
}

function AnswerTextarea({ value, onChange, placeholder, disabled }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={3}
      style={{
        background: WARM_LIGHT,
        color: "white",
        fontSize: 18,
        fontWeight: 500,
        padding: "16px 18px",
        width: "100%",
        resize: "none",
        lineHeight: 1.5,
      }}
    />
  )
}

function WaitingList({ players, doneIds, doneLabel = "Ready", waitLabel = "Writing…" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {players.map(p => {
        const done = doneIds.includes(p.id)
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: MID, padding: "12px 16px" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: done ? GREEN : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
            <span style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>{p.name}</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>{done ? doneLabel : waitLabel}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── main ───────────────────────────────────────────────────────────────────

export default function PlayPage({ params }) {
  const code = params.code
  const router = useRouter()

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [answers, setAnswers] = useState([])
  const [votes, setVotes] = useState([])
  const [myId, setMyId] = useState(null)

  // question writing
  const [myQuestion, setMyQuestion] = useState("")
  const [questionLoading, setQuestionLoading] = useState(false)

  // answering
  const [myAnswer, setMyAnswer] = useState("")
  const [answerLoading, setAnswerLoading] = useState(false)

  // voting
  const [selectedVote, setSelectedVote] = useState(null)
  const [voteLoading, setVoteLoading] = useState(false)

  // results ready-up
  const [readyLoading, setReadyLoading] = useState(false)

  // stable shuffle for voting answers
  const shuffledRef = useRef(null)
  const shuffledRoundRef = useRef(-1)

  useEffect(() => {
    const id = localStorage.getItem(`cc:${code}:playerId`)
    if (id) setMyId(id)
    loadState()
    let poll = setInterval(loadState, 5000)
    function handleVisibility() { clearInterval(poll); if (!document.hidden) { loadState(); poll = setInterval(loadState, 5000) } }
    document.addEventListener("visibilitychange", handleVisibility)
    const channel = supabase.channel(`cc-play-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cc_games", filter: `code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "cc_players", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "cc_answers", filter: `game_code=eq.${code}` }, loadState)
      .on("postgres_changes", { event: "*", schema: "public", table: "cc_votes", filter: `game_code=eq.${code}` }, loadState)
      .subscribe()
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", handleVisibility); supabase.removeChannel(channel) }
  }, [code])

  // Reset per-round input state when round advances
  useEffect(() => {
    setMyAnswer("")
    setAnswerLoading(false)
    setSelectedVote(null)
    setVoteLoading(false)
    setReadyLoading(false)
  }, [game?.current_round])

  async function loadState() {
    const [{ data: g }, { data: ps }, { data: an }, { data: vs }] = await Promise.all([
      supabase.from("cc_games").select("*").eq("code", code).single(),
      supabase.from("cc_players").select("*").eq("game_code", code).order("created_at"),
      supabase.from("cc_answers").select("*").eq("game_code", code),
      supabase.from("cc_votes").select("*").eq("game_code", code),
    ])
    if (!g) { router.push(`/${code}`); return }
    setGame(g)
    setPlayers(ps ?? [])
    setAnswers(an ?? [])
    setVotes(vs ?? [])
  }

  if (!game || !myId) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 18, fontWeight: 600 }}>Loading…</p>
      </div>
    )
  }

  const me = players.find(p => p.id === myId)
  if (!me) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 18, fontWeight: 600 }}>Loading…</p>
      </div>
    )
  }

  const { phase, current_round, player_order, ready_player_ids } = game
  const roundTarget = players.find(p => p.id === player_order?.[current_round])
  const roundQuestioner = players.find(p => p.target_id === roundTarget?.id)
  const iAmTarget = roundTarget?.id === myId
  const roundQuestion = roundQuestioner?.question ?? ""

  const roundAnswers = answers.filter(a => a.round === current_round)
  const roundVotes = votes.filter(v => v.round === current_round)

  const myAnswerRow = roundAnswers.find(a => a.player_id === myId)
  const myVoteRow = roundVotes.find(v => v.voter_id === myId)

  // Stable shuffle for voting
  if ((phase === "voting" || phase === "results") && roundAnswers.length > 0 && shuffledRoundRef.current !== current_round) {
    shuffledRef.current = [...roundAnswers].sort(() => Math.random() - 0.5)
    shuffledRoundRef.current = current_round
  }

  // ─── phase: question_writing ────────────────────────────────────────────

  if (phase === "question_writing") {
    const myTarget = players.find(p => p.id === me.target_id)
    const submittedIds = players.filter(p => p.questions_submitted).map(p => p.id)
    const iSubmitted = me.questions_submitted

    if (iSubmitted) {
      return (
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <TopBar>Write Your Questions</TopBar>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: "white", marginBottom: 8 }}>Question submitted!</p>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)" }}>Waiting for everyone else…</p>
            </div>
            <Section label="Waiting for everyone…">
              <WaitingList players={players} doneIds={submittedIds} />
            </Section>
          </div>
        </div>
      )
    }

    async function submitQuestion() {
      if (questionLoading || !myQuestion.trim()) return
      setQuestionLoading(true)
      const { error } = await supabase.rpc("cc_submit_question", {
        p_code: code,
        p_player_id: myId,
        p_question: myQuestion.trim(),
      })
      if (error) { setQuestionLoading(false) }
    }

    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <TopBar>Write Your Questions</TopBar>
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 6 }}>
              You're asking {myTarget?.name ?? "…"}.
            </p>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              Write a personal question for them — something with a specific answer. Everyone else will try to fake their response.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <AnswerTextarea
              value={myQuestion}
              onChange={setMyQuestion}
              placeholder={`Your question for ${myTarget?.name ?? "them"}…`}
            />
            <PrimaryBtn
              onClick={submitQuestion}
              loading={questionLoading}
              disabled={!myQuestion.trim()}
              label="Submit Question"
              loadingLabel="Submitting…"
            />
          </div>

          <Section label="Waiting for everyone…">
            <WaitingList players={players} doneIds={submittedIds} />
          </Section>
        </div>
      </div>
    )
  }

  // ─── phase: answering ────────────────────────────────────────────────────

  if (phase === "answering") {
    const answeredIds = roundAnswers.map(a => a.player_id)

    if (myAnswerRow) {
      return (
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <TopBar>Round {current_round + 1} of {players.length}</TopBar>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 12 }}>
                {roundQuestioner?.name} asked {roundTarget?.name}…
              </p>
              <BigQuestion question={roundQuestion} />
            </div>
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)" }}>Answer submitted. Waiting for everyone…</p>
            </div>
            <Section label="Waiting for everyone…">
              <WaitingList players={players} doneIds={answeredIds} />
            </Section>
          </div>
        </div>
      )
    }

    async function submitAnswer() {
      if (answerLoading || !myAnswer.trim()) return
      setAnswerLoading(true)
      const { error } = await supabase.rpc("cc_submit_answer", {
        p_code: code,
        p_player_id: myId,
        p_round: current_round,
        p_answer: myAnswer.trim(),
      })
      if (error) { setAnswerLoading(false) }
    }

    if (iAmTarget) {
      return (
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <TopBar>Round {current_round + 1} of {players.length}</TopBar>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 12 }}>
                {roundQuestioner?.name} wants to know…
              </p>
              <BigQuestion question={roundQuestion} />
            </div>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              You must answer truthfully. Everyone else will try to fool the group by writing something that sounds like you.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <AnswerTextarea
                value={myAnswer}
                onChange={setMyAnswer}
                placeholder="Your answer…"
              />
              <PrimaryBtn
                onClick={submitAnswer}
                loading={answerLoading}
                disabled={!myAnswer.trim()}
                label="Submit Answer"
                loadingLabel="Submitting…"
              />
            </div>
            <Section label="Waiting for everyone…">
              <WaitingList players={players} doneIds={answeredIds} />
            </Section>
          </div>
        </div>
      )
    }

    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <TopBar>Round {current_round + 1} of {players.length}</TopBar>
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 12 }}>
              {roundQuestioner?.name} asked {roundTarget?.name}…
            </p>
            <BigQuestion question={roundQuestion} />
          </div>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
            Write something that sounds like {roundTarget?.name} wrote it.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <AnswerTextarea
              value={myAnswer}
              onChange={setMyAnswer}
              placeholder={`Fake ${roundTarget?.name}'s answer…`}
            />
            <PrimaryBtn
              onClick={submitAnswer}
              loading={answerLoading}
              disabled={!myAnswer.trim()}
              label="Submit Answer"
              loadingLabel="Submitting…"
            />
          </div>
          <Section label="Waiting for everyone…">
            <WaitingList players={players} doneIds={answeredIds} />
          </Section>
        </div>
      </div>
    )
  }

  // ─── phase: voting ───────────────────────────────────────────────────────

  if (phase === "voting") {
    const votedIds = roundVotes.map(v => v.voter_id)
    const shuffled = shuffledRef.current ?? roundAnswers

    if (iAmTarget) {
      return (
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <TopBar>Round {current_round + 1} of {players.length}</TopBar>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 4 }}>Stay quiet!</p>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.65)" }}>Everyone is deciding which answer is really yours.</p>
            </div>
            <Section label="The answers">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {shuffled.map(a => {
                  const voteCount = roundVotes.filter(v => v.voted_for_player_id === a.player_id).length
                  return (
                    <div key={a.player_id} style={{ background: MID, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <p style={{ fontSize: 16, fontWeight: 500, color: "white", lineHeight: 1.4, flex: 1 }}>{a.answer}</p>
                      {voteCount > 0 && (
                        <div style={{ flexShrink: 0, background: YELLOW, color: "#000", fontSize: 13, fontWeight: 900, padding: "3px 8px", marginTop: 2 }}>
                          {voteCount}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Section>
            <Section label="Waiting for votes…">
              <WaitingList players={players.filter(p => p.id !== myId)} doneIds={votedIds} doneLabel="Voted" waitLabel="Deciding…" />
            </Section>
          </div>
        </div>
      )
    }

    if (myVoteRow) {
      return (
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <TopBar>Round {current_round + 1} of {players.length}</TopBar>
          <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: "white", marginBottom: 8 }}>Vote submitted!</p>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)" }}>Waiting for everyone…</p>
            </div>
            <Section label="Waiting for votes…">
              <WaitingList players={players.filter(p => p.id !== roundTarget?.id)} doneIds={votedIds} doneLabel="Voted" waitLabel="Deciding…" />
            </Section>
          </div>
        </div>
      )
    }

    async function submitVote() {
      if (voteLoading || !selectedVote) return
      setVoteLoading(true)
      const { error } = await supabase.rpc("cc_submit_vote", {
        p_code: code,
        p_voter_id: myId,
        p_round: current_round,
        p_voted_for_player_id: selectedVote,
      })
      if (error) { setVoteLoading(false) }
    }

    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <TopBar>Round {current_round + 1} of {players.length}</TopBar>
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 480, width: "100%", margin: "0 auto" }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 12 }}>
              Which answer is {roundTarget?.name}'s?
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginBottom: 16 }}>"{roundQuestion}"</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shuffled.map(a => {
              const selected = selectedVote === a.player_id
              return (
                <button
                  key={a.player_id}
                  onClick={() => setSelectedVote(a.player_id)}
                  style={{
                    background: selected ? YELLOW : MID,
                    color: selected ? "#000" : "white",
                    fontSize: 17,
                    fontWeight: selected ? 800 : 500,
                    padding: "18px 20px",
                    textAlign: "left",
                    lineHeight: 1.4,
                    border: selected ? "none" : "2px solid transparent",
                  }}
                >
                  {a.answer}
                  {selected && <span style={{ marginLeft: 8, fontWeight: 900 }}>✓</span>}
                </button>
              )
            })}
          </div>
          <PrimaryBtn
            onClick={submitVote}
            loading={voteLoading}
            disabled={!selectedVote}
            label="That's the Real One"
            loadingLabel="Submitting…"
          />
        </div>
      </div>
    )
  }

  // ─── phase: results ──────────────────────────────────────────────────────

  if (phase === "results") {
    const shuffled = shuffledRef.current ?? roundAnswers
    const targetAnswer = roundAnswers.find(a => a.player_id === roundTarget?.id)

    // Compute round deltas
    const deltas = {}
    players.forEach(p => { deltas[p.id] = 0 })
    roundVotes.forEach(v => {
      if (v.voted_for_player_id === roundTarget?.id) {
        // Correct vote: voter gets +2
        deltas[v.voter_id] = (deltas[v.voter_id] ?? 0) + 2
      } else {
        // Fooled: fake-answer writer gets +1
        deltas[v.voted_for_player_id] = (deltas[v.voted_for_player_id] ?? 0) + 1
      }
    })

    // Ready-up
    const readyIds = ready_player_ids ?? []
    const iReady = readyIds.includes(myId)
    const readyCount = readyIds.length
    const totalCount = players.length

    async function markReady() {
      if (readyLoading || iReady) return
      setReadyLoading(true)
      const { error } = await supabase.rpc("cc_mark_ready", {
        p_code: code,
        p_player_id: myId,
      })
      if (error) setReadyLoading(false)
    }

    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <TopBar>Round {current_round + 1} of {players.length} · Results</TopBar>
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 480, width: "100%", margin: "0 auto", paddingBottom: 100 }}>
          {/* Question context */}
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
            {roundQuestioner?.name} asked {roundTarget?.name}: "{roundQuestion}"
          </p>

          {/* Real answer */}
          {targetAnswer && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8 }}>
                {roundTarget?.name}'s real answer
              </div>
              <div style={{ background: GREEN, padding: "16px 20px" }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: "white", lineHeight: 1.4 }}>{targetAnswer.answer}</p>
              </div>
            </div>
          )}

          {/* All answers */}
          <Section label="Everyone's answers">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {shuffled.map(a => {
                const author = players.find(p => p.id === a.player_id)
                const isReal = a.player_id === roundTarget?.id
                const votersForThis = roundVotes.filter(v => v.voted_for_player_id === a.player_id)
                const fooledCount = isReal ? 0 : votersForThis.length
                const correctVoters = isReal ? votersForThis : []

                return (
                  <div key={a.player_id} style={{ background: isReal ? `${GREEN}33` : MID, padding: "14px 16px", borderLeft: isReal ? `4px solid ${GREEN}` : "4px solid transparent" }}>
                    <p style={{ fontSize: 16, fontWeight: 500, color: "white", lineHeight: 1.4, marginBottom: 6 }}>{a.answer}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: isReal ? GREEN : YELLOW }}>{author?.name}</span>
                      {isReal && correctVoters.length > 0 && (
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>· {correctVoters.length} spotted it</span>
                      )}
                      {!isReal && fooledCount > 0 && (
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>· fooled {fooledCount}</span>
                      )}
                      {!isReal && fooledCount === 0 && (
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>· no one fooled</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>

          {/* Points this round */}
          <Section label="Points this round">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {players.map(p => {
                const d = deltas[p.id] ?? 0
                const isTargetPlayer = p.id === roundTarget?.id
                let detail = ""
                if (!isTargetPlayer) {
                  if (roundVotes.find(v => v.voter_id === p.id && v.voted_for_player_id === roundTarget?.id)) {
                    detail = "spotted the real answer"
                  } else {
                    const fooled = roundVotes.filter(v => v.voted_for_player_id === p.id).length
                    if (fooled > 0) detail = `fooled ${fooled} ${fooled === 1 ? "person" : "people"}`
                  }
                }
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <div style={{ background: DARK, padding: "12px 14px", minWidth: 52, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color: d > 0 ? YELLOW : "rgba(255,255,255,0.4)" }}>
                        {d > 0 ? `+${d}` : "+0"}
                      </span>
                    </div>
                    <div style={{ background: MID, flex: 1, padding: "12px 16px" }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</span>
                      {!!detail && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginLeft: 8 }}>{detail}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>

          {/* Running totals */}
          <Section label="Running Totals">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{ background: DARK, padding: "12px 0", minWidth: 48, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900 }}>
                    {i + 1}
                  </div>
                  <div style={{ background: MID, flex: 1, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{p.name}{p.id === myId && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: YELLOW }}>{p.score}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* Fixed bottom: ready up */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px", paddingBottom: "calc(16px + env(safe-area-inset-bottom))", background: BG, borderTop: `1px solid ${DARK}` }}>
          {iReady ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>
                {readyCount} of {totalCount} ready — waiting for others…
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <PrimaryBtn
                onClick={markReady}
                loading={readyLoading}
                label={current_round + 1 < players.length ? "Next Round" : "See Final Scores"}
                loadingLabel="…"
              />
              <p style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>
                {readyCount} of {totalCount} ready
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── phase: finished ─────────────────────────────────────────────────────

  if (phase === "finished") {
    const sorted = [...players].sort((a, b) => b.score - a.score)
    const winner = sorted[0]

    async function playAgain() {
      router.push(`/${code}`)
    }

    return (
      <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
        <div style={{ background: DARK, padding: "20px", textAlign: "center" }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: "white" }}>Game Over</h1>
        </div>
        <div style={{ flex: 1, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 480, width: "100%", margin: "0 auto" }}>
          <Section label="Final Scores">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {sorted.map((p, i) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <div style={{ background: DARK, padding: "14px 0", minWidth: 48, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900 }}>
                    {i + 1}
                  </div>
                  <div style={{ background: MID, flex: 1, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span style={{ fontSize: 17, fontWeight: 700 }}>{p.name}</span>
                      {p.id === myId && <span style={{ fontSize: 12, opacity: 0.65, marginLeft: 6 }}>you</span>}
                      {p.id === winner.id && (
                        <div style={{ fontSize: 11, fontWeight: 800, color: YELLOW, textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 2 }}>
                          Winner
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 24, fontWeight: 900, color: YELLOW }}>{p.score} pts</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div style={{ padding: "20px", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
          <button
            onClick={playAgain}
            style={{ background: YELLOW, color: "#000", fontSize: 20, fontWeight: 900, padding: "20px", width: "100%" }}
          >
            Play Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 18, fontWeight: 600 }}>Loading…</p>
    </div>
  )
}
