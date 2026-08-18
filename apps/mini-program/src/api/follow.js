import {
	getFollowUps,
	getFollowUpDetail as getDetail,
	createFollowUp as create,
	updateFollowUp as update,
	completeFollowUp as complete,
	cancelFollowUp as cancel,
	deleteFollowUp as remove,
	startFollowUp as start,
	uploadFollowImage
} from '../utils/api.js'

export const getFollowUpList = (params = {}, options = {}) => getFollowUps(params, options)
export const getFollowUpDetail = (followId, options = {}) => getDetail(followId, options)
export const createFollowUp = (followData, options = {}) => create(followData, options)
export const updateFollowUp = (followId, updateData, options = {}) => update(followId, updateData, options)
export async function completeFollowUp(followId, result, summary, options = {}) {
	const normalizedResult = { ...result }
	if (Array.isArray(result?.images) && result.images.length > 0) {
		normalizedResult.images = await Promise.all(result.images.map(async (image) => {
			if (image && typeof image === 'object' && (image.assetId || image.id)) {
				return { assetId: image.assetId || image.id }
			}
			if (typeof image === 'string' && /^https?:\/\//i.test(image)) return image
			if (typeof image !== 'string' || !image) throw new Error('随访图片路径无效')
			const uploaded = await uploadFollowImage(image, {
				loading: false,
				formData: {
					scope: 'FOLLOW_UP',
					referenceType: 'FOLLOW_UP',
					referenceId: followId
				}
			})
			const assetId = uploaded.data?.id || uploaded.data?.fileID
			if (!assetId) throw new Error('随访图片上传结果缺少媒体资产 ID')
			return { assetId }
		}))
	}
	return complete({ followId, result: normalizedResult, summary }, options)
}
export const cancelFollowUp = (followId, options = {}) => cancel(followId, options)
export const deleteFollowUp = (followId, options = {}) => remove(followId, options)
export const startFollowUp = (followId, options = {}) => start(followId, options)
