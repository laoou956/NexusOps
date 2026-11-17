<template>
  <div class="request-inspector">
    <section class="inspector-section">
      <div class="inspector-section-heading">
        <h3>请求追踪</h3>
        <span class="state-label">
          <i :class="{ working: busy, complete: lastResponse && !busy }"></i>
          {{ busy ? '处理中' : lastResponse ? '已完成' : '待开始' }}
        </span>
      </div>
      <p class="inspector-intro">{{ busy ? '正在等待服务返回处理结果。' : lastResponse ? '本次请求的处理路径与路由结果。' : '发送一条消息，查看 Agent 的处理过程。' }}</p>
      <ol class="trace-steps" :class="{ complete: lastResponse && !busy }">
        <li>
          <span class="trace-step-icon">
            <AppIcon name="search" />
          </span>
          <div>
            <strong>意图识别 & 实体提取</strong>
            <p>{{ lastResponse ? `${lastResponse.intent || 'other'}${lastResponse.intentGroup ? ` (${lastResponse.intentGroup})` : ''}` : '识别细粒度运营意图与关键实体' }}</p>
            <div v-if="entityEntries.length" class="inspector-entities">
              <span v-for="[key, val] in entityEntries" :key="key" class="entity-chip">
                <b>{{ formatEntityKey(key) }}:</b> {{ formatEntityVal(val) }}
              </span>
            </div>
          </div>
        </li>
        <li>
          <span class="trace-step-icon">
            <AppIcon name="book" />
          </span>
          <div>
            <strong>按意图触发 RAG</strong>
            <p>{{ lastResponse ? (lastResponse.knowledgeUsed ? '已触发企业知识库检索 (RAG)' : lastResponse.ragGated ? '意图门控跳过检索 (Intent Gated)' : '按需未触发知识库检索') : '按意图门控策略检索企业知识库' }}</p>
          </div>
        </li>
        <li>
          <span class="trace-step-icon">
            <AppIcon name="route" />
          </span>
          <div>
            <strong>多 Agent 协同路由</strong>
            <p>{{ lastResponse ? `${lastResponse.primaryAgentRole || lastResponse.primaryAgent || lastResponse.agentType || '运营协调 Agent'}${lastResponse.supportingAgentRoles?.length ? ` · 协同: ${lastResponse.supportingAgentRoles.join(' / ')}` : ''}` : '分配主处理与辅助协同 Agent' }}</p>
            <div v-if="domainScoreEntries.length" class="domain-score-list">
              <div v-for="item in domainScoreEntries" :key="item.key" class="domain-score-row">
                <span>{{ item.label }}</span>
                <i><b :style="{ width: `${Math.min(100, Math.round(item.score * 100))}%` }"></b></i>
                <strong>{{ item.score.toFixed(2) }}</strong>
              </div>
            </div>
          </div>
        </li>
        <li>
          <span class="trace-step-icon">
            <AppIcon name="chat" />
          </span>
          <div>
            <strong>专业 Agent 执行</strong>
            <p>{{ busy ? '等待 Agent 协同执行' : lastResponse ? (lastResponse.escalated ? '运营升级通道 · 已转人工接管' : lastResponse.supportingAgentRoles?.length ? '主辅 Agent 协同合成完毕' : '专业 Agent 回复已生成') : '等待新的运营请求' }}</p>
          </div>
        </li>
      </ol>
      <div class="request-metrics">
        <div>
          <span>响应耗时</span>
          <strong>
            {{ lastResponse ? lastResponse.latencyMs : '—' }}
            <small v-if="lastResponse"> ms</small>
          </strong>
        </div>
        <div>
          <span>路由置信度</span>
          <strong>{{ lastResponse ? formatPercent(lastResponse.routingConfidence) : '—' }}</strong>
        </div>
      </div>
      <p v-if="lastResponse?.routingReason" class="routing-note">{{ lastResponse.routingReason }}</p>
      <details v-if="lastTrace?.trace" class="inspector-tools">
        <summary>
          <span>工具调用</span>
          <span class="count-tag">{{ lastTrace.trace.toolCalls?.length || 0 }}</span>
          <AppIcon name="chevron" />
        </summary>
        <div v-for="(call, index) in lastTrace.trace.toolCalls" :key="index" class="trace-call-item">
          <div class="trace-call-meta">
            <strong>{{ call.tool_name }}</strong>
            <span>{{ call.latency_ms ?? '—' }} ms</span>
          </div>
          <pre>{{ formatJson(call.input || {}) }}</pre>
        </div>
        <p v-if="!lastTrace.trace.toolCalls?.length" class="muted">{{ lastTrace.trace.toolsUsed?.length ? lastTrace.trace.toolsUsed.join(' · ') : '本次没有记录到工具输入。' }}</p>
      </details>
    </section>
    <section class="inspector-section">
      <div class="inspector-section-heading">
        <h3>运行状态</h3>
        <button class="icon-button" @click="$emit('refresh')" aria-label="刷新运行状态" title="刷新运行状态">
          <AppIcon name="refresh" />
        </button>
      </div>
      <div class="runtime-metrics">
        <div>
          <span>请求</span>
          <strong>{{ monitorData.loaded ? totalRequests : '—' }}</strong>
        </div>
        <div>
          <span>Agent</span>
          <strong>{{ monitorData.loaded ? agentCount : '—' }}</strong>
        </div>
        <div>
          <span>告警</span>
          <strong :class="{ danger: activeAlerts.length }">{{ monitorData.loaded ? activeAlerts.length : '—' }}</strong>
        </div>
      </div>
      <p v-if="activeAlerts.length" class="alert-note">
        <AppIcon name="alert" />
        {{ activeAlerts[0].detail || activeAlerts[0].title }}
      </p>
      <p v-else class="runtime-note">{{ monitorData.loaded ? '当前没有活跃告警' : '连接服务后查看运行状态' }}</p>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  lastResponse: { type: Object, default: null },
  lastTrace: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  monitorData: { type: Object, required: true }
})
defineEmits(['refresh'])
const activeAlerts = computed(() => props.monitorData.active_alerts || [])
const agentCount = computed(() => Object.keys(props.monitorData.agent_stats || {}).length)
const totalRequests = computed(() => Object.values(props.monitorData.agent_stats || {}).reduce((sum, item) => sum + Number(item.total || 0), 0))
const entityEntries = computed(() => Object.entries(props.lastResponse?.entities || {}).filter(([, val]) => val !== null && val !== undefined && (!Array.isArray(val) || val.length > 0)))
const DOMAIN_LABELS = { technical: '技术可靠性', billing: '收入与合规', general: '运营协调' }
const domainScoreEntries = computed(() => {
  const scores = props.lastResponse?.domainScores || {}
  return Object.entries(scores).map(([key, val]) => ({
    key,
    label: DOMAIN_LABELS[key] || key,
    score: Number(val || 0)
  }))
})
function formatEntityKey(key) {
  const map = { order_id: '订单号', amount: '金额', error_code: '错误码', date: '日期' }
  return map[key] || key
}
function formatEntityVal(val) {
  return Array.isArray(val) ? val.join(', ') : String(val)
}
function formatPercent(value) {
  const number = Number(value || 0)
  return `${(number <= 1 ? number * 100 : number).toFixed(1)}%`
}
function formatJson(value) { return JSON.stringify(value ?? {}, null, 2) }
</script>
