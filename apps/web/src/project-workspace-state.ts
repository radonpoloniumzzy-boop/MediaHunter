export function getProjectActionState(status: string, openQuestionCount: number) {
  return {
    canConfirm: openQuestionCount === 0 && status === "brief_draft",
    canStart: status === "brief_confirmed"
  };
}
