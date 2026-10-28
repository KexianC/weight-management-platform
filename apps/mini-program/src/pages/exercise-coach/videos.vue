<template><view class="role-page">
  <text class="role-title">动作视频库</text><text class="role-hint">维护当前有效视频，人工关联处方。下架只停止新选择，原件和既有处方快照保留。</text>
  <text v-if="error" class="role-error">{{ error }}</text><text v-if="notice" class="role-success">{{ notice }}</text>
  <form :key="editing || 'new'" @submit="save" class="role-panel"><text class="role-section">{{ editing ? '编辑视频说明' : '新增动作视频' }}</text>
    <view class="role-field"><text class="role-label">动作视频名称</text><input name="title" :value="form.title" @input="form.title=$event.detail.value" maxlength="120" placeholder="勿填写客户姓名、手机号或外部链接" /></view>
    <view class="role-field"><text class="role-label">动作说明</text><textarea name="description" :value="form.description" @input="form.description=$event.detail.value" maxlength="500" /></view>
    <view class="role-field"><text class="role-label">视频时长（秒）</text><input name="durationSeconds" :value="form.durationSeconds" @input="form.durationSeconds=$event.detail.value" type="number" placeholder="1–7200秒" /></view>
    <button v-if="!editing" @tap="choose" :disabled="busy">选择视频（100MB以内）</button>
    <text v-if="!editing" class="role-hint">{{ pendingAsset ? '视频已上传，重试使用同一附件' : selected ? '已选择视频' : '尚未选择视频' }}</text>
    <button form-type="submit" :disabled="busy" class="role-primary">{{ busy ? '保存中…' : editing ? '保存视频说明' : '上传并加入视频库' }}</button><button v-if="editing" @tap="reset">取消编辑</button>
  </form>
  <text class="role-hint">当前返回 {{ videos.length }} 个有效视频（接口最多500个）。</text>
  <view v-for="v in videos" :key="v.id" class="role-panel"><text class="role-section">{{ v.title }}</text><text class="role-text">{{ v.description || '无补充说明' }}</text><text class="role-hint">{{ v.durationSeconds }}秒</text><button @tap="preview(v,'video/mp4')">播放授权视频</button><view class="role-actions"><button @tap="edit(v)" :disabled="busy">编辑说明</button><button class="danger" @tap="archive(v)" :disabled="busy">下架（保留原件）</button></view></view>
  <text v-if="!loading&&!videos.length" class="role-hint">暂无有效视频，请先上传动作视频。</text><button v-if="error" @tap="loadPage">重新读取</button>
  <ProtectedMedia v-if="media" :asset="media" @close="media=null" /><StaffRoleNav role="EXERCISE_COACH" active="videos" :confirm-leave="!!selected || !!form.title" />
</view></template>
<script>
import StaffRoleNav from '../../components/StaffRoleNav.vue'
import ProtectedMedia from '../../components/ProtectedMedia.vue'
import { care, staffPage, pickMedia, uploadSelected, releaseSelection } from '../../utils/staff-care.js'
export default {components:{StaffRoleNav,ProtectedMedia},mixins:[staffPage('EXERCISE_COACH')],data:()=>({videos:[],form:{title:'',description:'',durationSeconds:''},editing:'',selected:null,pendingAsset:null,notice:''}),methods:{
 loadPage(){return this.read(async()=>{this.videos=await care.videos()})},
 choose(){return this.run(async()=>{const selected=await pickMedia('video');releaseSelection(this.selected);this.selected=selected;this.pendingAsset=null;if(selected.duration)this.form.durationSeconds=Math.round(selected.duration)})},
 save(e){return this.run(async()=>{const value={...this.form,...e.detail.value};const title=value.title.trim(),durationSeconds=Number(value.durationSeconds);if(!title||!Number.isInteger(durationSeconds)||durationSeconds<1||durationSeconds>7200)throw new Error('请填写视频名称及1–7200秒的整数时长');const dto={title,description:value.description.trim(),durationSeconds};if(this.editing)await care.editVideo(this.editing,dto);else{if(!this.selected&&!this.pendingAsset)throw new Error('请先选择视频');if(!this.pendingAsset)this.pendingAsset=await uploadSelected(this.selected);await care.addVideo({...dto,mediaAssetId:this.pendingAsset.id})}this.reset();this.notice='视频资料已保存';await this.loadPage()})},
 edit(v){this.reset();this.editing=v.id;this.form={title:v.title,description:v.description||'',durationSeconds:v.durationSeconds};uni.pageScrollTo({scrollTop:0,duration:200})},
 archive(v){uni.showModal({title:'下架动作视频',content:'下架后不可用于新处方，原件及既有处方快照保留。',success:r=>{if(r.confirm)this.run(async()=>{await care.archiveVideo(v.id);this.notice='视频已下架，原件未删除';await this.loadPage()})}})},
 reset(){releaseSelection(this.selected);this.selected=null;this.pendingAsset=null;this.editing='';this.form={title:'',description:'',durationSeconds:''}},clearPrivate(){this.reset();this.videos=[]}
}}
</script><style scoped lang="scss">@import '../../styles/role-workspace.scss';</style>
