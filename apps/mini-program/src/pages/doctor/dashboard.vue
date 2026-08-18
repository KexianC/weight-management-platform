<template>
  <view class="dashboard-container">
    <!-- 顶部统计卡片 -->
    <view class="stats-section">
      <view class="stats-grid">
        <view class="stat-card">
          <view class="stat-icon"><Icon name="User/group-line.svg" size="24" color="$primary-color" /></view>
          <view class="stat-content">
            <text class="stat-number">{{ totalPatients }}</text>
            <text class="stat-label">管理患者</text>
          </view>
        </view>
        <view class="stat-card">
          <view class="stat-icon"><Icon name="Business/line-chart-line.svg" size="24" color="$success-color" /></view>
          <view class="stat-content">
            <text class="stat-number">{{ activePatients }}</text>
            <text class="stat-label">活跃患者</text>
          </view>
        </view>
        <view class="stat-card">
          <view class="stat-icon"><Icon name="System/checkbox-circle-line.svg" size="24" color="$success-color" /></view>
          <view class="stat-content">
            <text class="stat-number">{{ completionRate }}%</text>
            <text class="stat-label">随访完成率</text>
          </view>
        </view>
        <view class="stat-card">
          <view class="stat-icon"><Icon name="System/alert-line.svg" size="24" color="$warning-color" /></view>
          <view class="stat-content">
            <text class="stat-number">{{ alertCount }}</text>
            <text class="stat-label">预警患者</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 关键指标监控 -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">关键指标监控</text>
        <text class="section-subtitle">实时监控患者健康状况</text>
      </view>
      <view class="indicators-grid">
        <view 
          v-for="indicator in keyIndicators" 
          :key="indicator.id"
          class="indicator-card"
          :class="indicator.status"
        >
          <view class="indicator-header">
            <text class="indicator-name">{{ indicator.patientName }}</text>
            <view class="indicator-status" :class="indicator.status">
              <text class="status-text">{{ indicator.statusText }}</text>
            </view>
          </view>
          <view class="indicator-metrics">
            <view class="metric">
              <text class="metric-label">当前体重</text>
              <text class="metric-value">{{ indicator.currentWeight === null ? '--' : `${indicator.currentWeight}kg` }}</text>
            </view>
            <view class="metric">
              <text class="metric-label">BMI</text>
              <text class="metric-value">{{ indicator.bmi === null ? '--' : indicator.bmi }}</text>
            </view>
            <view class="metric">
              <text class="metric-label">变化趋势</text>
              <view class="trend" :class="indicator.trend">
                <Icon :name="getTrendIcon(indicator.trendIcon)" size="16" :color="indicator.trend === 'up' ? '$error-color' : (indicator.trend === 'down' ? '$success-color' : '$gray-500')" />
                <text class="trend-value">{{ indicator.trendValue }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 依从率统计 -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">依从率统计</text>
        <text class="section-subtitle">患者配合度分析</text>
      </view>
      <view class="compliance-chart">
        <view class="chart-container">
          <view class="chart-header">
            <text class="chart-title">随访完成情况</text>
            <view class="week-selector">
              <view class="week-nav" role="button" aria-label="上一周" @click="previousWeek">
                <Icon name="Arrows/arrow-left-s-line.svg" size="20" color="$gray-600" />
              </view>
              <text class="chart-period">{{ currentWeek }}</text>
              <view class="week-nav" role="button" aria-label="下一周" @click="nextWeek">
                <Icon name="Arrows/arrow-right-s-line.svg" size="20" color="$gray-600" />
              </view>
            </view>
          </view>
          <view class="week-summary">
            <view class="summary-item">
              <text class="summary-label">本周总计</text>
              <text class="summary-value">{{ weekSummary.total }}次</text>
            </view>
            <view class="summary-item">
              <text class="summary-label">已完成</text>
              <text class="summary-value">{{ weekSummary.completed }}次</text>
            </view>
            <view class="summary-item">
              <text class="summary-label">完成率</text>
              <text class="summary-value">{{ weekSummary.rate }}%</text>
            </view>
          </view>
          <view class="progress-overview">
            <view class="progress-bar-large">
              <view 
                class="progress-fill-large"
                :style="{ width: weekSummary.rate + '%' }"
              ></view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
  
  <!-- 医生端底部导航 -->
  <view class="doctor-tabbar">
    <view 
      class="tab-item"
      @click="navigateToPage('/pages/doctor/index')"
    >
      <view class="tab-icon"><Icon name="Buildings/home-line.svg" size="20" color="$gray-400" /></view>
      <text class="tab-text">医生/营养师首页</text>
    </view>
    <view 
      class="tab-item active"
      @click="navigateToPage('/pages/doctor/dashboard')"
    >
      <view class="tab-icon"><Icon name="Business/bar-chart-line.svg" size="20" color="$primary-color" /></view>
      <text class="tab-text">数据看板</text>
    </view>
    <view 
      class="tab-item"
      @click="navigateToPage('/pages/doctor/patients')"
    >
      <view class="tab-icon"><Icon name="User/group-line.svg" size="20" color="$gray-400" /></view>
      <text class="tab-text">患者管理</text>
    </view>
    <view 
      class="tab-item"
      @click="navigateToPage('/pages/doctor/follow')"
    >
      <view class="tab-icon"><Icon name="Document/clipboard-line.svg" size="20" color="$gray-400" /></view>
      <text class="tab-text">随访管理</text>
    </view>
  </view>
</template>

<script>
import Icon from '../../components/Icon.vue'
import { getDoctorPatientRelations, getFollowUpStatistics, getHealthRecords, getOverallStats } from '../../utils/api.js'
import { getStorage, showToast, showLoading, hideLoading } from '../../utils/common.js'

export default {
  components: {
    Icon
  },
  data() {
    return {
      loading: false,
      userInfo: {},
      totalPatients: 0,
      activePatients: 0,
      completionRate: 0,
      alertCount: 0,
      currentWeek: '',
      currentWeekOffset: 0, // 当前周偏移量，0表示本周，-1表示上周，1表示下周
      keyIndicators: [],
      weekSummary: {
        total: 0,
        completed: 0,
        rate: 0
      }
    }
  },
  onLoad() {
    this.userInfo = getStorage('userInfo') || {}
    this.initCurrentWeek()
    this.loadDashboardData()
  },
  methods: {
    // 初始化当前周信息
    initCurrentWeek() {
      this.updateCurrentWeekDisplay()
    },

    // 更新当前周显示
    updateCurrentWeekDisplay() {
      const now = new Date()
      const targetDate = new Date(now.getTime() + this.currentWeekOffset * 7 * 24 * 60 * 60 * 1000)
      const year = targetDate.getFullYear()
      const startOfYear = new Date(year, 0, 1)
      const days = Math.floor((targetDate - startOfYear) / (24 * 60 * 60 * 1000))
      const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7)
      
      if (this.currentWeekOffset === 0) {
        this.currentWeek = `${year}年第${weekNumber}周 (本周)`
      } else if (this.currentWeekOffset === -1) {
        this.currentWeek = `${year}年第${weekNumber}周 (上周)`
      } else if (this.currentWeekOffset === 1) {
        this.currentWeek = `${year}年第${weekNumber}周 (下周)`
      } else {
        this.currentWeek = `${year}年第${weekNumber}周`
      }
    },

    // 上一周
    previousWeek() {
      this.currentWeekOffset--
      this.updateCurrentWeekDisplay()
      this.loadWeeklyCompliance(this.userInfo.userId)
    },

    // 下一周
    nextWeek() {
      this.currentWeekOffset++
      this.updateCurrentWeekDisplay()
      this.loadWeeklyCompliance(this.userInfo.userId)
    },

    // 加载仪表板数据
    async loadDashboardData() {
      if (this.loading) return
      this.loading = true
      showLoading('加载数据中...')
      
      try {
        const userId = this.userInfo.userId
        if (!userId) {
          showToast('用户信息获取失败')
          return
        }

        // 并行加载所有数据
        await Promise.all([
          this.loadPatientStats(userId),
          this.loadKeyIndicators(userId),
          this.loadWeeklyCompliance(userId)
        ])
        
      } catch (error) {
        console.error('加载仪表板数据失败:', error)
        showToast('数据加载失败')
      } finally {
        this.loading = false
        hideLoading()
      }
    },

    // 加载患者统计数据
    async loadPatientStats(doctorId) {
      try {
        const result = await getOverallStats({ doctorId })
        if (result.code === 200) {
          const stats = result.data || {}
          this.totalPatients = Number(stats.totalPatients || 0)
          this.activePatients = Number(stats.activePatients || 0)
          this.alertCount = Number(stats.attentionPatients || 0)
          this.completionRate = Number(stats.followUpCompletionRate || 0)
        }
        
      } catch (error) {
        console.error('加载患者统计失败:', error)
      }
    },

    // 加载关键指标数据
    async loadKeyIndicators(doctorId) {
      try {
        const patientResult = await getDoctorPatientRelations({ doctorId, pageSize: 5 })
        if (patientResult.code !== 200) return
        
        let patients = []
        if (Array.isArray(patientResult.data)) {
          patients = patientResult.data
        } else if (patientResult.data && Array.isArray(patientResult.data.patients)) {
          patients = patientResult.data.patients
        }
        
        const indicators = []
        
        // 获取前5个患者的最新健康数据
        for (const patient of patients.slice(0, 5)) {
          try {
            const healthResult = await getHealthRecords({
              patientId: patient.userId,
              type: 'weight',
              limit: 2,
              orderBy: 'recordDate',
              order: 'desc'
            })
            
            if (healthResult.code === 200 && healthResult.data && healthResult.data.length > 0) {
              const records = healthResult.data
              const latestRecord = records[0]
              const previousRecord = records[1]
              
              if (latestRecord.weight !== null && latestRecord.weight !== undefined) {
                const currentWeight = Number(latestRecord.weight)
                const bmiValue = patient.bmi !== null && patient.bmi !== undefined && Number.isFinite(Number(patient.bmi)) ? Number(patient.bmi) : null
                
                // 计算趋势
                let trend = 'stable'
                let trendIcon = '→'
                let trendValue = '±0.0kg'
                
                if (previousRecord && previousRecord.weight) {
                  const weightChange = currentWeight - previousRecord.weight
                  if (Math.abs(weightChange) > 0.1) {
                    trend = weightChange > 0 ? 'up' : 'down'
                    trendIcon = weightChange > 0 ? '↑' : '↓'
                    trendValue = `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)}kg`
                  }
                }
                
                // 判断状态
                let status = 'normal'
                let statusText = bmiValue === null ? '资料不足' : '正常'
                
                if (bmiValue !== null && bmiValue < 18.5) {
                  status = 'warning'
                  statusText = '偏瘦'
                } else if (bmiValue !== null && bmiValue >= 24) {
                  status = 'warning'
                  statusText = '超重'
                } else if (bmiValue !== null && bmiValue >= 18.5 && bmiValue < 24) {
                  status = 'good'
                  statusText = '良好'
                }
                
                indicators.push({
                  id: patient.userId,
                  patientName: patient.name || '患者',
                  currentWeight: currentWeight,
                  bmi: bmiValue,
                  status: status,
                  statusText: statusText,
                  trend: trend,
                  trendIcon: trendIcon,
                  trendValue: trendValue
                })
              }
            }
          } catch (error) {
            console.error(`获取患者${patient.name}健康数据失败:`, error)
          }
        }
        
        this.keyIndicators = indicators
        
      } catch (error) {
        console.error('加载关键指标失败:', error)
      }
    },

    // 加载每周依从率数据
    async loadWeeklyCompliance(doctorId) {
      try {
        const now = new Date()
        const targetDate = new Date(now.getTime() + this.currentWeekOffset * 7 * 24 * 60 * 60 * 1000)
        const weekStart = new Date(targetDate)
        weekStart.setDate(targetDate.getDate() - targetDate.getDay()) // 目标周开始
        weekStart.setHours(0, 0, 0, 0)
        
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 7) // 下一周起点，作为排他的结束时间
        
        try {
          // 获取整周的随访统计
          const followResult = await getFollowUpStatistics({
            doctorId,
            startAt: weekStart.toISOString(),
            endAt: weekEnd.toISOString()
          })
          
          if (followResult.code === 200 && followResult.data) {
            const stats = followResult.data
            const total = this.validFollowUpTotal(stats)
            const completed = stats.completed || 0
            const rate = total > 0 ? Math.round((completed / total) * 100) : 0
            
            this.weekSummary = {
              total: total,
              completed: completed,
              rate: rate
            }
          } else {
            this.weekSummary = {
              total: 0,
              completed: 0,
              rate: 0
            }
          }
        } catch (error) {
          console.error('获取随访统计失败:', error)
          this.weekSummary = {
            total: 0,
            completed: 0,
            rate: 0
          }
        }
        
      } catch (error) {
        console.error('加载每周依从率失败:', error)
        this.weekSummary = {
          total: 0,
          completed: 0,
          rate: 0
        }
      }
    },


    addPatient() {
      uni.redirectTo({
        url: '/pages/doctor/patients'
      })
    },
    createFollowUp() {
      uni.redirectTo({
        url: '/pages/doctor/follow'
      })
    },
    viewReports() {
      uni.redirectTo({ url: '/pages/doctor/patients' })
    },

    validFollowUpTotal(stats = {}) {
      return Number(stats.pending || 0) + Number(stats.ongoing || 0) + Number(stats.overdue || 0) + Number(stats.completed || 0)
    },
    
    // 获取趋势图标
    getTrendIcon(trendIcon) {
      const iconMap = {
        '↑': 'Arrows/arrow-up-line.svg',
        '↓': 'Arrows/arrow-down-line.svg',
        '→': 'Arrows/arrow-right-line.svg'
      }
      return iconMap[trendIcon] || 'Arrows/arrow-right-line.svg'
    },
    
    // 底部导航页面跳转
    navigateToPage(url) {
      if (url === '/pages/doctor/dashboard') {
        // 当前页面，不需要跳转
        return
      }
      // 使用redirectTo避免页面栈累积
      uni.redirectTo({ url: url })
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/design-system.scss';

.dashboard-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 20rpx 20rpx 140rpx;
}

.stats-section {
  margin-bottom: 30rpx;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
}

.stat-card {
  @include card-base;
  padding: 30rpx;
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, $primary-color 0%, lighten($primary-color, 10%) 100%);
  color: white;
  border-radius: 20rpx;
}

.stat-icon {
  font-size: 48rpx;
  margin-right: 20rpx;
}

.stat-content {
  flex: 1;
}

.stat-number {
  display: block;
  font-size: 36rpx;
  font-weight: bold;
  line-height: 1.2;
}

.stat-label {
  display: block;
  font-size: 24rpx;
  opacity: 0.9;
  margin-top: 8rpx;
}

.section {
  margin-bottom: 40rpx;
}

.section-header {
  margin-bottom: 24rpx;
}

.section-title {
  display: block;
  font-size: 32rpx;
  font-weight: bold;
  color: $gray-800;
  margin-bottom: 8rpx;
}

.section-subtitle {
  display: block;
  font-size: 24rpx;
  color: $gray-600;
}

.indicators-grid {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.indicator-card {
  @include card-base;
  padding: 30rpx;
  border-radius: 20rpx;
  border-left: 8rpx solid $secondary-color;
  
  &.warning {
    border-left-color: $warning-color;
  }
  
  &.good {
    border-left-color: $success-color;
  }
}

.indicator-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.indicator-name {
  font-size: 28rpx;
  font-weight: bold;
  color: $gray-800;
}

.indicator-status {
  padding: 8rpx 16rpx;
  border-radius: 20rpx;
  font-size: 22rpx;
  
  &.normal {
    background: lighten($secondary-color, 40%);
    color: $secondary-color;
  }
  
  &.warning {
    background: lighten($warning-color, 40%);
    color: $warning-color;
  }
  
  &.good {
    background: lighten($success-color, 40%);
    color: $success-color;
  }
}

.indicator-metrics {
  display: flex;
  justify-content: space-between;
}

.metric {
  text-align: center;
}

.metric-label {
  display: block;
  font-size: 22rpx;
  color: $gray-600;
  margin-bottom: 8rpx;
}

.metric-value {
  display: block;
  font-size: 28rpx;
  font-weight: bold;
  color: $gray-800;
}

.trend {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8rpx;
  
  &.up {
    color: $error-color;
  }
  
  &.down {
    color: $success-color;
  }
  
  &.stable {
    color: $gray-600;
  }
}

.trend-icon {
  font-size: 24rpx;
  margin-right: 4rpx;
}

.trend-value {
  font-size: 22rpx;
  font-weight: bold;
}

.compliance-chart {
  @include card-base;
  padding: 30rpx;
  border-radius: 20rpx;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30rpx;
}

.chart-title {
  font-size: 28rpx;
  font-weight: bold;
  color: $gray-800;
}

.week-selector {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.week-nav {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $gray-100;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    background: $primary-color;
    color: white;
  }
}

.nav-icon {
  font-size: 32rpx;
  font-weight: bold;
}

.chart-period {
  font-size: 24rpx;
  color: $gray-600;
  min-width: 200rpx;
  text-align: center;
}

.week-summary {
  display: flex;
  justify-content: space-around;
  margin-bottom: 30rpx;
  padding: 20rpx;
  background: lighten($gray-50, 3%);
  border-radius: 16rpx;
}

.summary-item {
  text-align: center;
}

.summary-label {
  display: block;
  font-size: 22rpx;
  color: $gray-600;
  margin-bottom: 8rpx;
}

.summary-value {
  display: block;
  font-size: 32rpx;
  font-weight: bold;
  color: $gray-800;
}

.progress-overview {
  margin-top: 20rpx;
}

.progress-bar-large {
  height: 24rpx;
  background: $gray-50;
  border-radius: 12rpx;
  overflow: hidden;
}

.progress-fill-large {
  height: 100%;
  background: linear-gradient(90deg, $primary-color 0%, $accent-color 100%);
  border-radius: 12rpx;
  transition: width 0.3s ease;
}



/* 医生端底部导航样式 */
.doctor-tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 100rpx;
  background-color: #ffffff;
  border-top: 1rpx solid #E5E5E5;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 1000;
  box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.1);
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
  transition: all 0.3s ease;
}

.tab-item.active .tab-icon {
  transform: scale(1.1);
}

.tab-item.active .tab-text {
  color: #2E86AB;
  font-weight: 600;
}

.tab-icon {
  font-size: 40rpx;
  margin-bottom: 8rpx;
  transition: all 0.3s ease;
}

.tab-text {
  font-size: 22rpx;
  color: #666666;
  transition: all 0.3s ease;
}

/* 2026 clinical visual refresh */
.dashboard-container {
  padding: 24rpx 24rpx calc(148rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 88% 1%, rgba(102, 203, 229, 0.2), transparent 300rpx),
    linear-gradient(180deg, #eaf7fc 0, #f7fbfd 360rpx, #f5f9fb 100%);
  color: #15324a;
}

.stats-section {
  margin-bottom: 34rpx;
}

.stats-grid {
  gap: 18rpx;
}

.stat-card {
  min-height: 138rpx;
  padding: 24rpx;
  color: #15324a;
  background: rgba(255, 255, 255, 0.96);
  border: 1rpx solid #d8ecf3;
  border-radius: 24rpx;
  box-shadow: 0 10rpx 28rpx rgba(31, 119, 151, 0.07);
}

.stat-card:nth-child(1) {
  border-top: 5rpx solid #178bb4;
}

.stat-card:nth-child(2) {
  border-top: 5rpx solid #39a978;
}

.stat-card:nth-child(3) {
  border-top: 5rpx solid #54a7be;
}

.stat-card:nth-child(4) {
  border-top: 5rpx solid #ef9a57;
}

.stat-icon {
  width: 64rpx;
  height: 64rpx;
  margin-right: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e8f7fb;
  border-radius: 18rpx;
}

.stat-number {
  font-size: 38rpx;
  font-weight: 700;
  color: #167fa5;
}

.stat-label {
  color: #5f7483;
  opacity: 1;
}

.section {
  margin-bottom: 36rpx;
}

.section-header {
  margin-bottom: 18rpx;
  padding: 0 4rpx;
}

.section-title {
  margin-bottom: 6rpx;
  font-size: 30rpx;
  font-weight: 700;
  color: #18374d;
}

.section-subtitle {
  font-size: 23rpx;
  color: #768b99;
}

.indicators-grid {
  gap: 18rpx;
}

.indicator-card {
  padding: 26rpx;
  background: #ffffff;
  border: 1rpx solid #dcecf2;
  border-left: 6rpx solid #55a9c1;
  border-radius: 22rpx;
  box-shadow: 0 9rpx 26rpx rgba(31, 119, 151, 0.06);
}

.indicator-card.warning {
  border-left-color: #efa05f;
}

.indicator-card.good {
  border-left-color: #47af80;
}

.indicator-name {
  font-size: 29rpx;
  color: #17364c;
}

.indicator-status {
  padding: 7rpx 16rpx;
  border-radius: 999rpx;
}

.indicator-status.normal {
  color: #167fa5;
  background: #e8f7fb;
}

.indicator-status.warning {
  color: #b96826;
  background: #fff3e8;
}

.indicator-status.good {
  color: #2a8b5b;
  background: #e9f8f0;
}

.indicator-metrics {
  padding: 20rpx 8rpx 4rpx;
  background: #f7fbfc;
  border-radius: 18rpx;
}

.metric {
  flex: 1;
}

.metric-label {
  color: #768a97;
}

.metric-value {
  color: #19384d;
}

.compliance-chart {
  padding: 28rpx;
  background: #ffffff;
  border: 1rpx solid #dcecf2;
  border-radius: 24rpx;
  box-shadow: 0 10rpx 28rpx rgba(31, 119, 151, 0.07);
}

.chart-title {
  color: #17364c;
}

.week-nav {
  width: 88rpx;
  height: 88rpx;
  min-width: 88rpx;
  background: #eef8fb;
  border-radius: 16rpx;
  box-sizing: border-box;
}

.chart-period {
  color: #607888;
}

.week-summary {
  padding: 22rpx 12rpx;
  background: #f5fafc;
  border: 1rpx solid #e1eef3;
  border-radius: 18rpx;
}

.summary-label {
  color: #728894;
}

.summary-value {
  color: #167fa5;
}

.progress-bar-large {
  height: 20rpx;
  background: #e8f0f3;
}

.progress-fill-large {
  background: linear-gradient(90deg, #1684ad, #2aa8c8);
}

.doctor-tabbar {
  height: 108rpx;
  background: rgba(255, 255, 255, 0.97);
  border-top-color: #dcecf2;
  box-shadow: 0 -8rpx 28rpx rgba(30, 95, 119, 0.08);
}

.tab-item {
  position: relative;
}

.tab-item.active::before {
  content: '';
  position: absolute;
  top: 0;
  width: 42rpx;
  height: 5rpx;
  border-radius: 0 0 8rpx 8rpx;
  background: #1688b1;
}

.tab-item.active .tab-icon {
  transform: none;
}

.tab-item.active .tab-text {
  color: #167fa5;
}

.tab-text {
  font-size: 21rpx;
  color: #8294a0;
}
</style>
