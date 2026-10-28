// Match the API's current weight field first while retaining historical result shapes.
// Nullish selection keeps a recorded zero visible instead of treating it as missing.
export function followUpWeight(result) {
	return result?.weightKg ?? result?.weight ?? result?.weightData?.weightKg ?? result?.weightData?.weight
}
