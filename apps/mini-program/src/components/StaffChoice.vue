<template><view class="staff-choice">
  <button class="choice-trigger" @tap="opened=true;search=''">{{ selected?.[labelKey] || placeholder }}</button>
  <view v-if="opened" class="choice-overlay"><view class="choice-panel">
    <view class="choice-heading"><text>{{ label }}</text><button @tap="opened=false">取消</button></view>
    <input v-model="search" placeholder="搜索选项" class="choice-search" />
    <scroll-view scroll-y class="choice-list"><button v-for="o in filtered" :key="o[valueKey]" class="choice-option" @tap="choose(o)">{{ o[labelKey] }}</button><text v-if="!filtered.length" class="choice-empty">暂无匹配选项</text></scroll-view>
  </view></view>
</view></template>
<script>
export default {props:{modelValue:{type:[String,Number],default:''},options:{type:Array,default:()=>[]},label:{type:String,default:'选择选项'},placeholder:{type:String,default:'请选择'},labelKey:{type:String,default:'displayName'},valueKey:{type:String,default:'id'}},emits:['update:modelValue'],data:()=>({opened:false,search:''}),computed:{selected(){return this.options.find(o=>o[this.valueKey]===this.modelValue)},filtered(){const q=this.search.trim().toLowerCase();return this.options.filter(o=>o[this.valueKey]!==''&&String(o[this.labelKey]||'').toLowerCase().includes(q))}},methods:{choose(o){this.$emit('update:modelValue',o[this.valueKey]);this.opened=false;this.search=''}}}
</script>
<style scoped>
.choice-trigger{width:100%;min-height:44px;margin:0;padding:10px 12px;box-sizing:border-box;background:#f8fbfd;border:1px solid #d5e5ed;border-radius:8px;color:#18384e;font-size:14px;line-height:1.5;text-align:left;display:flex;align-items:center;justify-content:flex-start;white-space:normal}
.choice-overlay{position:fixed;inset:0;z-index:1400;background:rgba(18,39,53,.55);display:flex;align-items:center;justify-content:center;padding:18px 12px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box}
.choice-panel{width:100%;max-width:430px;max-height:82vh;padding:12px;box-sizing:border-box;border-radius:14px;background:#fff;display:flex;flex-direction:column;gap:10px}
.choice-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;font-size:16px}.choice-heading button,.choice-option{min-height:44px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:8px 12px;margin:0;font-size:14px;line-height:1.5;white-space:normal}
.choice-search{height:44px;flex-shrink:0;background:#f5f9fb;border:1px solid #d5e5ed;box-sizing:border-box;padding:8px 12px;border-radius:8px;font-size:14px}.choice-list{height:48vh;min-height:100px}.choice-option{width:100%;background:#eef8fb;color:#12688e;margin-bottom:8px}.choice-empty{display:block;padding:20px;color:#667f90}
</style>
