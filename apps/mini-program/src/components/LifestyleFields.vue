<template><view>
  <view v-for="f in numeric" :key="f.key" class="role-field"><text class="role-label">{{ f.label }}</text><input :name="f.key" type="digit" :value="modelValue[f.key]" @input="change(f.key,$event.detail.value)" /></view>
  <view v-for="group in choices" :key="group.key" class="role-field"><text class="role-label">{{ group.label }}</text>
    <picker :range="group.options" range-key="label" :value="position(group)" @change="change(group.key,group.options[Number($event.detail.value)].value)"><view class="role-picker">{{ group.options[position(group)].label }}</view></picker>
  </view>
</view></template>
<script>
import { LIFESTYLE_FIELDS } from '../utils/staff-role-model.js'
export default {props:{modelValue:{type:Object,required:true}},emits:['update:modelValue'],data:()=>({numeric:LIFESTYLE_FIELDS,choices:[
 {key:'activityLevel',label:'日常活动程度',options:[{value:'LOW',label:'较少活动'},{value:'MODERATE',label:'中等活动'},{value:'HIGH',label:'较多活动'}]},
 {key:'smoking',label:'吸烟情况',options:[{value:'NEVER',label:'从不'},{value:'FORMER',label:'已戒烟'},{value:'CURRENT',label:'目前吸烟'}]},
 {key:'alcohol',label:'饮酒情况',options:[{value:'NEVER',label:'从不'},{value:'OCCASIONAL',label:'偶尔'},{value:'FREQUENT',label:'经常'}]}
]}),methods:{position(g){return Math.max(0,g.options.findIndex(o=>o.value===this.modelValue[g.key]))},change(key,value){this.$emit('update:modelValue',{...this.modelValue,[key]:value})}}}
</script>
<style scoped lang="scss">@import '../styles/role-workspace.scss';input,.role-picker{min-height:44px;box-sizing:border-box;width:100%;padding:14rpx 18rpx;font-size:28rpx;line-height:1.5;background:#f8fbfd;border:1rpx solid #d5e5ed;border-radius:12rpx;color:#18384e}</style>
