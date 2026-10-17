export const LOW_BALANCE_THRESHOLD = 1000

export function hasLowBalance(student) {
  return student?.balance != null && Number(student.balance) <= LOW_BALANCE_THRESHOLD
}
