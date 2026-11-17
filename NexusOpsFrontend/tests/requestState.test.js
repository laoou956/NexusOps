import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequestState } from '../src/lib/requestState.js'
import { formatAgentRole, normalizeChatResponse } from '../src/lib/backends.js'

function state() { return { backend:'python', userId:'a', conversationId:'', endpoints:{python:'/py',java:'/java'} } }

test('switching away and back invalidates old responses', () => {
  const settings = state()
  const requests = createRequestState(settings)
  const old = requests.begin('stats')
  settings.backend = 'java'; requests.invalidate()
  settings.backend = 'python'; requests.invalidate()
  assert.equal(old.isCurrent(), false)
  assert.equal(requests.begin('stats').isCurrent(), true)
})

test('latest request wins within each slot and request settings are snapshots', () => {
  const settings = state()
  const requests = createRequestState(settings)
  const old = requests.begin('stats')
  const fresh = requests.begin('stats')
  requests.begin('monitor')
  assert.equal(old.isCurrent(), false)
  assert.equal(fresh.isCurrent(), true)
  settings.endpoints.python = '/changed'
  assert.equal(fresh.settings.endpoints.python, '/py')
  assert.equal(fresh.isCurrent(), false)
})

const source = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
function loadFunction(name, context) {
  const start = source.indexOf(`async function ${name}(`)
  const next = source.slice(start + 1).search(/\n(?:async )?function /)
  const end = next < 0 ? source.indexOf('</script>',start) : start + 1 + next
  vm.runInContext(source.slice(start,end),context)
}

for (const [name, requestName, field, result] of [
  ['loadStats','requestKnowledgeStats','knowledgeCount',{total_chunks: 99}],
  ['loadMonitor','requestMonitor','monitorData',{agent_stats:{old:true}}],
  ['loadSkills','requestSkills','skillsData',{skills:['old']}],
]) {
  for (const fail of [false,true]) {
    test(`${name}: stale ${fail ? 'error' : 'success'} cannot overwrite switched state`, async () => {
      const settings = state()
      const requests = createRequestState(settings)
      let resolve, reject
      const pending = new Promise((a,b)=>{resolve=a;reject=b})
      const context = vm.createContext({settings,requestState:requests,[field]:{value:'new'},[requestName]:()=>pending})
      loadFunction(name,context)
      const task = context[name]()
      settings.backend='java'; requests.invalidate()
      if (fail) reject(new Error('old')); else resolve(result)
      await task
      assert.equal(context[field].value,'new')
    })
  }
}

test('stale eval response does not clear a new operation busy state', async () => {
  const settings=state(), requests=createRequestState(settings)
  let resolve
  const context=vm.createContext({settings, requestState:requests, busy:{value:false},evalData:{value:'new'},
    statusText:{value:''}, showToast:()=>assert.fail('stale toast'), requestEvaluation:()=>new Promise(a=>{resolve=a})})
  loadFunction('runEvaluation',context)
  const task=context.runEvaluation()
  settings.backend='java'; requests.invalidate(); context.busy.value=true
  resolve({avg_scores:{accuracy:0.5}})
  await task
  assert.equal(context.evalData.value,'new')
  assert.equal(context.busy.value,true)
})

test('formatAgentRole maps internal agent types to NexusOps enterprise roles', () => {
  assert.equal(formatAgentRole('general'), '运营协调 Agent')
  assert.equal(formatAgentRole('technical'), '技术可靠性 Agent')
  assert.equal(formatAgentRole('billing'), '收入与合规 Agent')
  assert.equal(formatAgentRole('escalation'), '运营升级通道')
  const normalized = normalizeChatResponse('python', {
    response: '协同结论',
    intent: 'bug_report',
    intent_group: 'technical',
    primary_agent: 'technical',
    supporting_agents: ['billing'],
    domain_scores: { technical: 0.9, billing: 0.65, general: 0.2 },
    rag_eligible: true,
    rag_gated: false,
    knowledge_used: true,
    agent_outputs: [
      { role: 'primary', label: '[主处理]', agent_role: '技术可靠性 Agent', content: '排查 401' },
      { role: 'supporting', label: '[辅助处理]', agent_role: '收入与合规 Agent', content: '核查重复扣款' }
    ]
  })
  assert.equal(normalized.primaryAgentRole, '技术可靠性 Agent')
  assert.deepEqual(normalized.supportingAgentRoles, ['收入与合规 Agent'])
  assert.equal(normalized.domainScores.technical, 0.9)
  assert.equal(normalized.agentOutputs.length, 2)
})
