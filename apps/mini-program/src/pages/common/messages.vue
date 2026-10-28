<template>
	<view class="messages-container">
		<!-- 自定义导航栏 -->
		<view class="custom-navbar">
			<view class="navbar-content">
				<view class="navbar-left" role="button" aria-label="返回" @click="goBack">
					<Icon name="Arrows/arrow-left-line.svg" size="20" color="#ffffff" />
				</view>
				<view class="navbar-center">
					<view class="navbar-title-row">
						<image class="navbar-logo" src="/static/logo.png" alt="MedTalent健康数字助手" aria-label="MedTalent健康数字助手" mode="aspectFit"></image>
						<text class="navbar-title">{{ conversationTitle }}</text>
					</view>
					<text class="navbar-subtitle" v-if="subtitle">{{ subtitle }}</text>
				</view>
				<view class="navbar-right"></view>
			</view>
		</view>

		<!-- 留言列表 -->
		<scroll-view 
			class="message-list" 
			scroll-y="true" 
			:scroll-top="scrollTop"
			scroll-with-animation="true"
			@scrolltoupper="loadMoreMessages"
			refresher-enabled
			:refresher-triggered="refresherTriggered"
			@refresherrefresh="onRefresh"
		>
			<!-- 加载更多提示 -->
			<view class="load-more" v-if="hasMore && !loading">
				<text class="load-more-text">上拉加载更多留言</text>
			</view>
			
			<!-- 加载中 -->
			<view class="loading" v-if="loading">
				<text class="loading-text">加载中...</text>
			</view>

			<!-- 留言列表 -->
			<view class="message-item" v-for="(message, index) in messages" :key="message.messageId || index">
				<!-- 医生/发送者留言 -->
				<view class="message-sender" v-if="!isMyMessage(message)">
					<view class="message-avatar">
						<text class="avatar-text">{{ getSenderAvatar(message) }}</text>
					</view>
					<view class="message-content">
						<view class="message-info">
							<text class="sender-name">{{ getSenderName(message) }}</text>
							<text class="message-time">{{ formatTime(message.createdAt) }}</text>
						</view>
						<view class="message-bubble sender-bubble">
							<text class="message-text">{{ message.content }}</text>
						</view>
					</view>
				</view>

				<!-- 我的留言 -->
				<view class="message-mine" v-if="isMyMessage(message)">
					<view class="message-content">
						<view class="message-info">
							<text class="message-time">{{ formatTime(message.createdAt) }}</text>
							<text class="sender-name">我</text>
						</view>
						<view class="message-bubble mine-bubble">
							<text class="message-text">{{ message.content }}</text>
						</view>
					</view>
					<view class="message-avatar">
						<text class="avatar-text">我</text>
					</view>
				</view>
			</view>
		</scroll-view>

		<!-- 输入区域 -->
		<view class="input-area">
			<view class="input-container">
				<textarea 
					class="message-input" 
					v-model="inputMessage"
					placeholder="输入留言..."
					auto-height
					maxlength="500"
					@focus="onInputFocus"
					@blur="onInputBlur"
				></textarea>
				<button 
					class="send-btn" 
					:class="{active: inputMessage.trim()}"
					@click="sendMessage"
					:disabled="!inputMessage.trim() || sending"
				>
					<text class="send-text">{{ sending ? '发送中' : '发送' }}</text>
				</button>
			</view>
		</view>
	</view>
</template>

<script>
import Icon from '@/components/Icon.vue'
import { getMessages, sendMessage, markMessageAsRead } from '@/utils/api.js'
import { getStorage } from '@/utils/common.js'

export default {
	components: {
		Icon
	},
	data() {
		return {
			// 页面参数
			otherUserId: '', // 对话对象ID
			otherUserName: '', // 对话对象姓名
			relatedId: '', // 关联ID（任务ID或随访ID）
			relatedType: '', // 关联类型（task, follow_up）
			userRole: '', // 当前用户角色
			currentUserId: '', // 当前用户ID
			
			// 留言数据
			messages: [],
			inputMessage: '',
			scrollTop: 0,
			
			// 分页和加载
			page: 1,
			limit: 20,
			hasMore: true,
			loading: false,
			sending: false,
			refresherTriggered: false,
			
			// 自动刷新
			refreshTimer: null
		}
	},
	
	computed: {
		// 对话标题
		conversationTitle() {
			if (this.relatedType === 'task') {
				return '任务留言'
			} else if (this.relatedType === 'follow_up') {
				return '随访留言'
			} else if (this.relatedType === 'patient') {
				return '患者留言'
			}
			return '留言对话'
		},
		
		// 副标题
		subtitle() {
			if (this.otherUserName) {
				return `与${this.otherUserName}的对话`
			}
			return ''
		}
	},
	
	async onLoad(options) {
		// 获取页面参数
		this.otherUserId = options.otherUserId || ''
		this.otherUserName = decodeURIComponent(options.otherUserName || '')
		this.relatedId = options.relatedId || options.messageId || ''
		this.relatedType = options.relatedType || ''
		
		// 获取当前用户信息
		const userInfo = getStorage('userInfo')
		if (userInfo) {
			this.currentUserId = userInfo.userId
			this.userRole = userInfo.role
		}
		
		// 如果是从通知跳转过来的，需要根据messageId获取对话信息
		if (options.messageId && !this.otherUserId) {
			await this.loadMessageContext(options.messageId)
			// 如果获取上下文失败，loadMessageContext会自动返回上一页，这里不需要继续执行
			if (!this.otherUserId) {
				return
			}
		}
		
		// 确保有对话对象ID才加载消息
		if (!this.otherUserId) {
			uni.showToast({
				title: '缺少对话对象信息',
				icon: 'none'
			})
			setTimeout(() => {
				uni.navigateBack()
			}, 1500)
			return
		}
		
		// 加载留言列表
		this.loadMessages()
		
		// 标记留言为已读
		this.markMessagesAsRead()
		
		// 设置自动刷新
		this.startAutoRefresh()
	},
	
	onUnload() {
		// 清除定时器
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer)
		}
	},
	
	methods: {
		// 返回上一页
		goBack() {
			uni.navigateBack()
		},
		
		// 加载留言列表
		async loadMessages(isLoadMore = false) {
			if (this.loading) return
			
			this.loading = true
			
			try {
				const params = {
					userId: this.currentUserId,
					otherUserId: this.otherUserId,
					page: isLoadMore ? this.page : 1,
					limit: this.limit
				}
				
				// 添加关联条件
				if (this.relatedId && this.relatedType) {
					params.relatedId = this.relatedId
					params.relatedType = this.relatedType
				}
				
				const result = await getMessages(params)
				
				if (result.code === 200) {
					const newMessages = result.data.messages || []
					
					if (isLoadMore) {
						// 加载更多，添加到列表前面
						this.messages = [...newMessages, ...this.messages]
					} else {
						// 首次加载或刷新
						this.messages = newMessages
						// 滚动到底部
						this.$nextTick(() => {
							this.scrollToBottom()
						})
					}
					
					// 更新分页信息
					this.hasMore = newMessages.length >= this.limit
					if (isLoadMore) {
						this.page++
					}
				} else {
					uni.showToast({
						title: result.message || '加载失败',
						icon: 'none'
					})
				}
			} catch (error) {
				console.error('加载留言失败:', error)
				uni.showToast({
					title: '加载失败',
					icon: 'none'
				})
			} finally {
				this.loading = false
			}
		},
		
		// 加载更多留言
		loadMoreMessages() {
			if (this.hasMore && !this.loading) {
				this.loadMessages(true)
			}
		},
		
		// 下拉刷新
		async onRefresh() {
			this.refresherTriggered = true
			try {
				this.page = 1
				await this.loadMessages(false)
			} finally {
				this.refresherTriggered = false
			}
		},
		
		// 发送留言
		async sendMessage() {
			if (!this.inputMessage.trim() || this.sending) return
			
			const content = this.inputMessage.trim()
			this.inputMessage = ''
			this.sending = true
			
			try {
				const messageData = {
					senderId: this.currentUserId,
					receiverId: this.otherUserId,
					content: content,
					messageType: 'text'
				}
				
				// 添加关联信息
				if (this.relatedId && this.relatedType) {
					messageData.relatedId = this.relatedId
					messageData.relatedType = this.relatedType
				}
				
				const result = await sendMessage(messageData)
				
				if (result.code === 200) {
					// 添加到消息列表
					const newMessage = {
						messageId: result.data.messageId,
						senderId: this.currentUserId,
						receiverId: this.otherUserId,
						content: content,
						messageType: 'text',
						createdAt: result.data.createdAt || new Date(),
						isRead: false,
						relatedId: this.relatedId,
						relatedType: this.relatedType,
						senderInfo: {
							name: '我',
							role: this.userRole
						}
					}
					
					this.messages.push(newMessage)
					
					// 滚动到底部
					this.$nextTick(() => {
						this.scrollToBottom()
					})
					
					uni.showToast({
						title: '发送成功',
						icon: 'success'
					})
				} else {
					uni.showToast({
						title: result.message || '发送失败',
						icon: 'none'
					})
					// 恢复输入内容
					this.inputMessage = content
				}
			} catch (error) {
				console.error('发送留言失败:', error)
				uni.showToast({
					title: '发送失败',
					icon: 'none'
				})
				// 恢复输入内容
				this.inputMessage = content
			} finally {
				this.sending = false
			}
		},
		
		// 判断是否是我的留言
		isMyMessage(message) {
			return message.senderId === this.currentUserId
		},
		
		// 获取发送者头像文字
		getSenderAvatar(message) {
			if (message.senderInfo && message.senderInfo.role === 'doctor') {
				return '医'
			} else if (message.senderInfo && message.senderInfo.role === 'patient') {
				return '患'
			}
			return message.senderInfo?.name?.charAt(0) || '用'
		},
		
		// 获取发送者姓名
		getSenderName(message) {
			return message.senderInfo?.name || '未知用户'
		},
		
		// 格式化时间
		formatTime(dateTime) {
			if (!dateTime) return ''
			
			const date = new Date(dateTime)
			const now = new Date()
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
			const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
			
			const hours = String(date.getHours()).padStart(2, '0')
			const minutes = String(date.getMinutes()).padStart(2, '0')
			const timeStr = `${hours}:${minutes}`
			
			if (messageDate.getTime() === today.getTime()) {
				// 今天
				return timeStr
			} else if (messageDate.getTime() === today.getTime() - 24 * 60 * 60 * 1000) {
				// 昨天
				return `昨天 ${timeStr}`
			} else {
				// 其他日期
				const month = String(date.getMonth() + 1).padStart(2, '0')
				const day = String(date.getDate()).padStart(2, '0')
				return `${month}-${day} ${timeStr}`
			}
		},
		
		// 滚动到底部
		scrollToBottom() {
			this.scrollTop = 999999
		},
		
		// 输入框聚焦
		onInputFocus() {
			setTimeout(() => {
				this.scrollToBottom()
			}, 300)
		},
		
		// 输入框失焦
		onInputBlur() {
			// 可以在这里处理失焦逻辑
		},
		
		// 标记留言为已读
		async markMessagesAsRead() {
			if (!this.otherUserId) return
			
			try {
				await markMessageAsRead({
					userId: this.currentUserId,
					otherUserId: this.otherUserId
				})
			} catch (error) {
				console.error('标记已读失败:', error)
			}
		},
		
		// 开始自动刷新
		startAutoRefresh() {
			this.refreshTimer = setInterval(() => {
				this.loadMessages()
			}, 30000) // 30秒刷新一次
		},
		
		// 根据留言ID加载对话上下文
		async loadMessageContext(messageId) {
			try {
				// 通过留言ID获取留言详情，从而获取对话双方信息
				const result = await getMessages({ 
					messageId,
					userId: this.currentUserId 
				})
				if (result.code === 200 && result.data.messages && result.data.messages.length > 0) {
					const message = result.data.messages[0]
					// 确定对话对象
					if (message.senderId === this.currentUserId) {
						this.otherUserId = message.receiverId
						this.otherUserName = message.receiverInfo?.name || '对方'
					} else {
						this.otherUserId = message.senderId
						this.otherUserName = message.senderInfo?.name || '对方'
					}
					// 设置关联信息
					if (message.relatedId && message.relatedType) {
						this.relatedId = message.relatedId
						this.relatedType = message.relatedType
					}
				} else {
					// 如果获取不到留言信息，显示错误并返回
					console.error('无法获取留言上下文，messageId:', messageId)
					uni.showToast({
						title: '留言信息获取失败',
						icon: 'none'
					})
					// 返回上一页
					setTimeout(() => {
						uni.navigateBack()
					}, 1500)
					return
				}
			} catch (error) {
				console.error('加载留言上下文失败:', error)
				uni.showToast({
					title: '加载失败，请重试',
					icon: 'none'
				})
				// 返回上一页
				setTimeout(() => {
					uni.navigateBack()
				}, 1500)
				return
			}
		}
	}
}
</script>

<style scoped>
.messages-container {
	height: 100vh;
	display: flex;
	flex-direction: column;
	background: linear-gradient(180deg, #e8f4f8 0%, #f7fbfd 52%, #ffffff 100%);
	overflow-x: hidden; /* 防止横向滚动 */
	width: 100vw;
	max-width: 100vw;
}

/* 自定义导航栏 */
.custom-navbar {
	background: linear-gradient(135deg, #236f8e 0%, #4b9fba 100%);
	padding-top: var(--status-bar-height);
	box-shadow: 0 8rpx 24rpx rgba(31, 86, 109, 0.2);
}

.navbar-content {
	height: 88rpx;
	display: flex;
	align-items: center;
	padding: 0 30rpx;
}

.navbar-left {
	width: 88rpx;
	height: 88rpx;
	min-width: 88rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 50%;
	transition: all 0.3s ease;
}

.navbar-left:active {
	background-color: rgba(255, 255, 255, 0.2);
}

.back-icon {
	font-size: 48rpx;
	color: #ffffff;
	font-weight: 300;
}

.navbar-center {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}

.navbar-title-row {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10rpx;
}

.navbar-logo {
	width: 38rpx;
	height: 38rpx;
	flex-shrink: 0;
}

.navbar-title {
	font-size: 32rpx;
	font-weight: 600;
	color: #ffffff;
	margin-bottom: 0;
}

.navbar-subtitle {
	font-size: 24rpx;
	color: rgba(255, 255, 255, 0.8);
}

.navbar-right {
	width: 80rpx;
}

/* 留言列表 */
.message-list {
	flex: 1;
	padding: 28rpx 24rpx;
	overflow-y: auto;
	overflow-x: hidden; /* 防止横向滚动 */
	width: 100%;
	box-sizing: border-box;
}

.load-more, .loading {
	text-align: center;
	padding: 20rpx;
}

.load-more-text, .loading-text {
	font-size: 24rpx;
	color: #999;
}

.message-item {
	margin-bottom: 30rpx;
}

/* 发送者留言 */
.message-sender {
	display: flex;
	align-items: flex-start;
	justify-content: flex-start;
}

.message-sender .message-avatar {
	width: 80rpx;
	height: 80rpx;
	border-radius: 50%;
	background: linear-gradient(135deg, #2e86ab 0%, #7fc6d7 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	margin-right: 20rpx;
	flex-shrink: 0;
}

.message-sender .message-content {
	flex: 1;
	max-width: calc(100% - 120rpx);
	min-width: 0; /* 确保flex子元素可以收缩 */
}

/* 我的留言 */
.message-mine {
	display: flex;
	align-items: flex-start;
	justify-content: flex-end;
}

.message-mine .message-avatar {
	width: 80rpx;
	height: 80rpx;
	border-radius: 50%;
	background: linear-gradient(135deg, #246f90 0%, #4b9fba 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	margin-left: 20rpx;
	flex-shrink: 0;
}

.message-mine .message-content {
	flex: 1;
	max-width: calc(100% - 120rpx);
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	min-width: 0; /* 确保flex子元素可以收缩 */
}

.avatar-text {
	font-size: 28rpx;
	color: #ffffff;
	font-weight: 600;
}

.message-info {
	display: flex;
	align-items: center;
	margin-bottom: 8rpx;
	gap: 15rpx;
}

.message-mine .message-info {
	flex-direction: row-reverse;
}

.sender-name {
	font-size: 24rpx;
	color: #666666;
	font-weight: 500;
}

.message-time {
	font-size: 22rpx;
	color: #999999;
}

.message-bubble {
	padding: 20rpx 25rpx;
	border-radius: 20rpx;
	position: relative;
	min-width: 60rpx;
	max-width: 100%; /* 改为100%以适应父容器 */
	width: fit-content;
	word-wrap: break-word;
	word-break: break-word; /* 强制长单词换行 */
	box-shadow: 0 8rpx 24rpx rgba(31, 86, 109, 0.09);
	display: inline-block;
	box-sizing: border-box;
}

.sender-bubble {
	background-color: #ffffff;
	border: 1rpx solid rgba(46, 134, 171, 0.1);
	border-bottom-left-radius: 8rpx;
	margin-right: auto;
}

.mine-bubble {
	background: linear-gradient(135deg, #2e86ab 0%, #4b9fba 100%);
	border-bottom-right-radius: 8rpx;
	margin-left: auto;
}

.sender-bubble .message-text {
	color: #333333;
}

.mine-bubble .message-text {
	color: #ffffff;
}

.message-text {
	font-size: 28rpx;
	line-height: 1.5;
	word-break: break-all;
}

/* 输入区域 */
.input-area {
	background: rgba(255, 255, 255, 0.96);
	padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
	border-top: 1rpx solid rgba(46, 134, 171, 0.1);
	box-shadow: 0 -8rpx 24rpx rgba(31, 86, 109, 0.08);
}

.input-container {
	display: flex;
	align-items: flex-end;
	gap: 20rpx;
}

.message-input {
	flex: 1;
	min-height: 80rpx;
	max-height: 200rpx;
	padding: 20rpx;
	font-size: 28rpx;
	color: #333333;
	background-color: #f5fafc;
	border: 2rpx solid #dce8ed;
	border-radius: 20rpx;
	box-sizing: border-box;
	line-height: 1.4;
}

.message-input:focus {
	border-color: #2E86AB;
	outline: none;
}

.send-btn {
	width: 120rpx;
	height: 80rpx;
	background-color: #E9ECEF;
	color: #999999;
	border: none;
	border-radius: 16rpx;
	font-size: 28rpx;
	font-weight: 600;
	transition: all 0.3s ease;
	display: flex;
	align-items: center;
	justify-content: center;
}

.send-btn.active {
	background: linear-gradient(135deg, #2e86ab 0%, #246f90 100%);
	color: #ffffff;
	box-shadow: 0 4rpx 15rpx rgba(46, 134, 171, 0.3);
}

.send-btn.active:active {
	transform: scale(0.95);
}

.send-text {
	font-size: 26rpx;
}
</style>

<style scoped>
/* Narrow-screen action spacing and reachable controls. */
.messages-container .send-btn { min-width: 64px; min-height: 44px; height: auto; padding: 10px; flex-shrink: 0; }
.messages-container .message-input { min-width: 0; min-height: 44px; }
.messages-container .input-container { gap: 10px; }
</style>

<style scoped>
/* Interactive view touch targets: layout only. */
.navbar-left { min-width: 44px; min-height: 44px; flex-shrink: 0; }
</style>
