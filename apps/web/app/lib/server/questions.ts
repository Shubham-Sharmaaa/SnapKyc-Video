const QUESTION_BANK = [
  "Please state your full name as it appears on your ID.",
  "What is your date of birth?",
  "Which city and state are you in right now?",
  "Please hold your ID card next to your face.",
  "Please turn your head slowly to the left, then to the right.",
  "What is the purpose of opening this account?",
  "What is your occupation?",
  "Please blink twice, then smile.",
  "What is your current residential address?",
];

// Three random questions for the agent; one is a spoken random code, which a
// pre-recorded video cannot answer.
export function pickQuestions(random: () => number = Math.random) {
  const pool = [...QUESTION_BANK];
  const picked: string[] = [];
  while (picked.length < 2 && pool.length > 0) {
    const [question] = pool.splice(Math.floor(random() * pool.length), 1);
    if (question) picked.push(question);
  }
  const code = String(Math.floor(random() * 9000) + 1000);
  picked.push(`Please read this code aloud: ${code}`);
  return picked;
}
