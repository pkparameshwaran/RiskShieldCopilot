import { answerRiskQuestion } from "./riskEngine.js";

export async function askRiskCopilot(question, dataset) {
  return answerRiskQuestion(question, dataset);
}

