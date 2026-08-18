import {
	resetPassword as resetPasswordRequest,
	sendSmsCode,
	verifySmsCode
} from './api.js'

const verifiedCodes = new Map()

export const sendForgotPasswordSMS = (phone, options = {}) => {
	verifiedCodes.delete(phone)
	return sendSmsCode({
		phone,
		purpose: 'RESET_PASSWORD'
	}, 'reset_password', options)
}

export const verifyForgotPasswordCode = (phone, smsCode, options = {}) => verifySmsCode(
	phone,
	smsCode,
	'RESET_PASSWORD',
	options
).then((result) => {
	verifiedCodes.set(phone, smsCode)
	return result
})

export const resetPassword = (phone, newPassword, options = {}) => {
	const { smsCode, ...requestOptions } = options
	return resetPasswordRequest({
		phone,
		smsCode: smsCode || verifiedCodes.get(phone),
		newPassword
	}, requestOptions).then((result) => {
		verifiedCodes.delete(phone)
		return result
	})
}
