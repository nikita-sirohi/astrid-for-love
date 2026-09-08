import { runAgent } from './agent-runner.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { storyTypes } from './memory-store.mjs';
import { facets, topicUnderstanding, safeClarification, clarificationPurposes } from './understanding.mjs';
import { configuration, promptFor, selectedVersions } from './runtime.mjs';

const topics = ['dating', 'family', 'ambition', 'closeness', 'relationships', 'repair', 'convictions'];
const hash = value => createHash('sha256').update(value).digest('hex');
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const string = { type: 'string', minLength: 1, maxLength: 4000 };
const enumeration = values => ({ type: 'string', enum: values });
const array = (items, maxItems = 20) => ({ type: 'array', items, maxItems });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const topic = enumeration(topics);
const facet = enumeration(facets.map(item => item.id));
const profileFields = ['age', 'gender', 'pronouns', 'interestedIn', 'ageRange', 'location'];
const summary={type:['string','null'],minLength:1,maxLength:110};
const schemas = {
  summarize: object({summaries:array(object({id:string,summary:{type:'string',minLength:1,maxLength:110}}),80)}),
  converse: object({ reply: string, permissions: array(object({ memoryId: string, recipientId: string })) }),
  understand: object({ memories: array(object({ id: { type: ['string', 'null'] }, topic, facet, text: string, summary, readiness:{type:['string','null'],enum:['understood','needs_exploration','incidental']},
      status: enumeration(['confirmed', 'tentative']), strength: enumeration(['requires', 'prefers', 'accepts', 'unknown']), evidenceIds: array(string) })),
    stories: array(object({ id: { type: ['string','null'] }, storyType: enumeration(storyTypes), text: string, summary, status: enumeration(['confirmed','tentative']), evidenceIds: array(string) }), 6),
    profileUpdates: array(object({ field: enumeration(profileFields), value: string, correction: { type: 'boolean' }, evidenceIds: array(string) }), 6),
    clarificationUpdates: array(object({ id: string, status: enumeration(['answered', 'deferred', 'declined', 'obsolete']), evidenceIds: array(string) })),
    gaps: array(object({ topic, reason: { type: 'string', minLength: 1, maxLength: 600 } }), 2) }),
  review: object({ decision: enumeration(['propose', 'needs_clarification', 'withhold']), reason: string, exploration: enumeration(['allow', 'hold']),
    evidenceIds: array(string, 100), clarifications: array(object({ participantId: string, topic, facet, purpose:enumeration(Object.keys(clarificationPurposes)), evidenceIds: array(string) })) }),
  introduce: object({ text: string }),
  sharedOpening: object({text:string}),
  advise: object({ text: string }),
  checkin: object({ reply: string }),
};

// Validate locally too: refusals, malformed adapters and invalid IDs never become mutations.
function validate(value, schema) {
  if (Array.isArray(schema.type)) return schema.type.some(type=>type==='null'?value===null:validate(value,{...schema,type}));
  if (schema.type === 'object') return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => Object.hasOwn(schema.properties, key))
    && schema.required.every(key => Object.hasOwn(value, key) && validate(value[key], schema.properties[key]));
  if (schema.type === 'array') return Array.isArray(value) && value.length <= schema.maxItems && value.every(item => validate(item, schema.items));
  if (schema.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'string' && (!schema.enum || schema.enum.includes(value))
    && (!schema.minLength || value.trim().length >= schema.minLength) && (!schema.maxLength || value.length <= schema.maxLength);
}

export async function applicationPrompt(role, version = role === 'memy' ? '0.6.0' : selectedVersions[role]) {
  if (role === 'memy') {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid Memy prompt version.');
    const file = `memy/v${version}.md`;
    const source = await readFile(new URL(`../prompts/${file}`, import.meta.url), 'utf8');
    const instructions = source.split('## Prompt body\n')[1];
    if (!instructions) throw new Error('Application prompt assembly failed.');
    return { instructions, assets: [{ file, hash: hash(source) }], hash: hash(instructions) };
  }
  const lab = await promptFor(role, version);
  const boundary = '\n\nRuntime mode: local prompt laboratory.';
  const index = lab.instructions.lastIndexOf(boundary);
  if (index < 0) throw new Error('Application prompt assembly failed.');
  const overlay = await readFile(new URL('../prompts/runtime/v0.10.0.md', import.meta.url), 'utf8');
  const instructions = lab.instructions.slice(0, index) + '\n\n' + overlay.split('## Prompt body\n')[1];
  return { instructions, assets: [...lab.assets, { file: 'runtime/v0.10.0.md', hash: hash(overlay) }], hash: hash(instructions) };
}

export async function structuredResponse({ key, model, instructions, input, schema, task, tools = [], fetchImpl = fetch, timeoutMs = 120000 }) {
  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model, instructions, input, store: false, stream: false,
        reasoning: { effort: 'low' }, max_output_tokens: 6000,
        ...(tools.length?{tools,parallel_tool_calls:false,include:['reasoning.encrypted_content']}:{}),
        text: { format: { type: 'json_schema', name: `astrid_${task}`, strict: true, schema } } }),
    });
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
    const body = await response.json();
    if (body.status !== 'completed') throw new Error('Agent response incomplete.');
    if (!Array.isArray(body.output) || body.output.some(item => !['message', 'reasoning', ...(tools.length?['function_call']:[])].includes(item.type))) throw new Error('Invalid agent response.');
    if(body.output.some(item=>item.type==='function_call'))return {output:body.output,id:body.id,model:body.model,usage:body.usage};
    const content = body.output.filter(item => item.type === 'message').flatMap(item => item.content || []);
    if (content.some(item => item.type !== 'output_text')) throw new Error('Invalid agent response.');
    const data = JSON.parse(content.map(item => item.text).join(''));
    return { data, output:body.output, id: body.id, model: body.model, usage: body.usage };
  } catch (error) {
    const message = /^(API HTTP \d{3}|Agent response incomplete\.|Invalid agent response\.)$/.test(error.message) ? error.message : 'Agent request failed or timed out.';
    throw new Error(message);
  }
}

const publicProfile = value => pick(value, ['id', 'name', 'age', 'gender', 'pronouns', 'location', 'bio', 'photo', 'interests']);
const ownProfile = value => ({ ...publicProfile(value), ...pick(value, ['interestedIn', 'matchingEnabled', 'revision', 'ageRange', 'profileFieldLocks']),
  profileConflicts: (value.profileConflicts || []).map(item => pick(item, ['field', 'proposedValue', 'evidenceIds'])) });
const cleanMemory = value => pick(value, ['id', 'participantId', 'kind', 'storyType', 'topic', 'facet', 'text', 'readiness', 'status', 'strength', 'sharing', 'evidenceIds', 'revision', 'userLocked', 'locked']);
const ownMemories = (memories, id) => memories.filter(memory => memory.participantId === id && !memory.deleted).map(cleanMemory);
const ownMessages = (messages, id) => messages.filter(message => message.chatId === `astrid-${id}`
  && (message.authorId === id || message.authorId === 'astrid' || message.authorId === 'system'))
  .map(message => pick(message, ['id', 'role', 'authorId', 'text']));

function contextFor(task, args) {
  if(task==='summarize')return {memories:ownMemories(args.memories||[],args.participant.id)};
  if(task==='sharedOpening')return {participants:args.participants.map(publicProfile),shareableMemories:(args.shareableMemories||[]).filter(m=>!m.deleted&&args.participants.some(p=>p.id===m.participantId)).map(cleanMemory)};
  if (task === 'review') {
    if (args.participants.length !== 2) throw new Error('Matching requires exactly two participants.');
    const ids = args.participants.map(person => person.id);
    return { facets, topicUnderstanding:Object.fromEntries(ids.map(id=>[id,topicUnderstanding({memories:args.memories},id)])), phase:args.phase||'full', missingFacets:args.missingFacets||[], participants: args.participants.map(ownProfile), memories: args.memories.filter(memory => ids.includes(memory.participantId) && !memory.deleted && memory.kind !== 'story').map(cleanMemory),
      previousReviews: (args.previousReviews || []).map(review => pick(review, ['decision', 'reason', 'evidenceIds', 'clarifications', 'revisions'])) };
  }
  if (task === 'advise') {
    const memories = ownMemories(args.memories || [], args.participant.id);
    if (!['promising', 'explore', 'hold'].includes(args.assessment?.status) || typeof args.assessment?.canRequest !== 'boolean') throw new Error('Invalid advice assessment.');
    const safeTopics = (args.assessment.topics || []).flatMap(item => {
      const def = facets.find(facet => facet.id === item.facet);
      if (!def) return [];
      const evidenceIds = (item.evidenceIds || []).filter(id => memories.some(memory => memory.id === id && memory.facet === def.id));
      return !item.evidenceIds?.length || evidenceIds.length ? [{ ...def, ...safeClarification({...item,evidenceIds}), evidenceIds }] : [];
    });
    return { participant: ownProfile(args.participant), memories, other: publicProfile(args.other),
      shareableMemories: (args.shareableMemories || []).filter(memory => !memory.deleted && memory.participantId === args.other.id).map(cleanMemory),
      assessment: { status: args.assessment.status, basis:['preliminary','other_unstarted','unassessed','reviewed'].includes(args.assessment.basis)?args.assessment.basis:'reviewed', topics: safeTopics, canRequest: args.assessment.status !== 'hold' && args.assessment.canRequest } };
  }
  if (task === 'introduce') return { recipient: publicProfile(args.recipient), other: publicProfile(args.other),
    // These records have already been permission-filtered for this recipient by the domain.
    shareableMemories: (args.shareableMemories || []).filter(memory => !memory.deleted && memory.participantId === args.other.id).map(cleanMemory) };
  const context = { participant: ownProfile(args.participant), memories: ownMemories(args.memories || [], args.participant.id),
    messages: ownMessages(args.messages || [], args.participant.id) };
  if (task === 'checkin') return { ...context, other: publicProfile(args.other) };
  const privateContext = { ...context, facets, topicUnderstanding:topicUnderstanding({memories:context.memories},args.participant.id), memoryTombstones: (args.memoryTombstones || []).map(item => pick(item, ['id', 'kind', 'storyType', 'topic', 'facet'])), clarifications: (args.clarifications || []).filter(item => item.participantId === args.participant.id)
    .map(item => {
      const def = facets.find(facet => facet.id === item.facet);
      if (!def || def.topic !== item.topic) return null;
      const evidenceIds = (item.evidenceIds || []).filter(id => context.memories.some(memory => memory.id === id && memory.facet === def.id));
      return safeClarification({...pick(item,['id','participantId','status','facet','purpose']),evidenceIds,memoryRevisions:Object.fromEntries(evidenceIds.map(id=>[id,context.memories.find(memory=>memory.id===id).revision??null]))});
    }).filter(Boolean) };
  if (task === 'understand') return privateContext;
  const gaps = (args.understanding?.gaps || []).filter(item => topics.includes(item.topic) && typeof item.reason === 'string')
    .slice(0, 2).map(item => ({ topic: item.topic, reason: item.reason.slice(0, 600) }));
  return { ...privateContext, understanding: { gaps }, permissionRecipients: (args.permissionRecipients || []).map(publicProfile) };
}

function validateReferences(task, data, context) {
  const fail = () => { throw new Error('Invalid agent evidence or authority.'); };
  if(task==='summarize'){if(data.summaries.length!==context.memories.length||new Set(data.summaries.map(x=>x.id)).size!==data.summaries.length||data.summaries.some(x=>!context.memories.some(m=>m.id===x.id)))fail();return;}
  if (task === 'review') {
    if (data.decision === 'withhold' && data.exploration !== 'hold') fail();
    if (data.exploration === 'allow' && context.participants.some(person=>Object.values(context.topicUnderstanding[person.id]).some(detail=>detail.status!=='understood'))) fail();
    if (data.evidenceIds.some(id => !context.memories.some(memory => memory.id === id))) fail();
    if (data.clarifications.some(item => !context.participants.some(person => person.id === item.participantId)
      || !facets.some(def => def.id === item.facet && def.topic === item.topic)
      || item.evidenceIds.some(id => !context.memories.some(memory => memory.id === id && memory.participantId === item.participantId && memory.facet === item.facet)))) fail();
    if (data.decision === 'needs_clarification' && !data.clarifications.length) fail();
    if (data.decision === 'propose' && context.participants.some(person => !context.memories.some(memory => memory.participantId === person.id && data.evidenceIds.includes(memory.id)))) fail();
  }
  if (task === 'converse') {
    for (const permission of data.permissions) {
      if (!context.memories.some(memory => memory.id === permission.memoryId) || !context.permissionRecipients.some(person => person.id === permission.recipientId)) fail();
    }
    return;
  }
  if (task !== 'understand') return;
  const userEvidence = new Set(context.messages.filter(message => message.role === 'user' && message.authorId === context.participant.id).map(message => message.id));
  const latestUser = context.messages.filter(message => message.role === 'user' && message.authorId === context.participant.id).at(-1);
  const latestEvidence = ids => ids.length > 0 && ids.every(id => id === latestUser?.id);
  for (const memory of data.memories) {
    if (!memory.evidenceIds.length || memory.evidenceIds.some(id => !userEvidence.has(id))) fail();
    if (!facets.some(def => def.id === memory.facet && def.topic === memory.topic)) fail();
    if (memory.id && context.memoryTombstones.some(item => item.id === memory.id)) fail();
    if (memory.id && !context.memories.some(existing => existing.id === memory.id && existing.topic === memory.topic && existing.facet === memory.facet && !existing.userLocked && !existing.locked)) fail();
    if (memory.id === null) delete memory.id;
  }
  for (const story of data.stories) {
    if (!story.evidenceIds.length || story.evidenceIds.some(id => !userEvidence.has(id)) || !story.evidenceIds.includes(latestUser?.id)) fail();
    if (story.id && context.memoryTombstones.some(item => item.id === story.id)) fail();
    if (story.id && !context.memories.some(existing => existing.id === story.id && existing.kind === 'story' && !existing.userLocked && !existing.locked)) fail();
    if (story.id === null) delete story.id;
  }
  for (const update of data.profileUpdates) {
    if (!latestEvidence(update.evidenceIds)) fail();
    let value;
    try { value = JSON.parse(update.value); } catch { fail(); }
    const valid = update.field === 'age' ? Number.isInteger(value) && value >= 0 && value <= 120
      : update.field === 'ageRange' ? Array.isArray(value) && value.length === 2 && value.every(age => Number.isInteger(age) && age >= 18 && age <= 120) && value[0] <= value[1]
      : update.field === 'interestedIn' ? Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(item => typeof item === 'string' && item.trim() && item.length <= 100)
      : typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
    if (!valid) fail();
  }
  if (new Set(data.profileUpdates.map(update => update.field)).size !== data.profileUpdates.length) fail();
  for (const update of data.clarificationUpdates) {
    const clarification = context.clarifications.find(item => item.id === update.id && item.status === 'queued');
    if (!clarification || !latestEvidence(update.evidenceIds)) fail();
    if (update.status === 'answered' && !data.memories.some(memory => memory.facet === clarification.facet && memory.status === 'confirmed' && memory.evidenceIds.includes(latestUser.id))) fail();
    if (update.status === 'obsolete' && !context.memories.some(memory => memory.facet === clarification.facet && memory.status === 'confirmed')) fail();
  }
}

const questions = {
  dating: 'What kind of relationship are you looking for, and which genders are you interested in dating?',
  family: 'What would a partner need to understand about the role family plays in your life?',
  ambition: 'What takes priority when work and your personal life compete?',
  closeness: 'How much space do you like to keep for yourself in a relationship?',
  relationships: 'Which friendships or other relationships would a new partner need to make room for?',
  repair: 'When you disagree with someone you care about, what actually happens next?',
  convictions: 'What belief or expectation would you want a partner to understand before things got serious?',
};

function scripted(task, context) {
  if(task==='summarize')return {summaries:context.memories.map(m=>({id:m.id,summary:m.text.length>107?m.text.slice(0,107)+'…':m.text}))};
  if (task === 'advise') {
    const name = context.other.name;
    if (context.assessment.status === 'hold') return { text: `I would hold off on requesting an introduction to ${name} for now. ${context.assessment.topics.length ? `We need to explore ${context.assessment.topics.map(t=>t.label.toLowerCase()).join(" and ")} if you want to connect.` : "I cannot recommend an introduction on what is established yet; I will not invent a reason or ask you to negotiate someone’s boundary."}` };
    if (context.assessment.status === 'explore') return { text: `${name} looks worth getting curious about. I would use an early conversation to compare what a good week together looks like—there is room to discover whether your rhythms fit.` };
    return { text: `I think ${name} looks promising for you. ${context.other.interests?.[0] ? `Ask about ${context.other.interests[0]}; that is a better opening than trying to deliver the perfect line.` : 'Start with a story and see whether the conversation has a little pull.'}` };
  }
  if(task==='sharedOpening')return {text:`${context.participants.map(p=>p.name).join(' and ')}, you're both here. What's a small, oddly specific thing that made your week better? I'll leave you to it.`};
  if (task === 'introduce') {
    const interest = context.other.interests?.[0];
    return { text: `Meet ${context.other.name}. ${interest ? `Ask about ${interest}—there is your opening for a conversation.` : 'There is a new conversation here if you are curious.'} Take a look and decide whether you feel a spark.` };
  }
  if (task === 'checkin') return { reply: `How are you feeling about the connection with ${context.other.name}? There is no obligation to make it work; if you are curious, what would you want to share about yourself next?` };
  if (task === 'review') {
    const evidenceIds = context.memories.map(memory => memory.id);
    const missing=context.participants.flatMap(person=>Object.entries(context.topicUnderstanding[person.id]).filter(([,detail])=>detail.status!=='understood').map(([topic])=>({participantId:person.id,topic,facet:facets.find(f=>f.topic===topic).id,purpose:'baseline',evidenceIds:[]})));
    if (missing.length) return { decision: 'needs_clarification', exploration: 'hold', reason: 'Scripted demo: basic understanding is incomplete; discuss the first uncovered topic for each person.', evidenceIds, clarifications: missing.slice(0, 2) };
    const uncertainRequirement=context.memories.find(m=>m.status==='tentative'&&(m.strength==='requires'||(['family.household','family.care','family.children','dating.structure'].includes(m.facet)&&m.strength==='unknown')));
    if(uncertainRequirement)return {decision:'needs_clarification',exploration:'hold',reason:'Scripted demo: the practical terms of a required arrangement are unresolved.',evidenceIds:[uncertainRequirement.id],clarifications:[{participantId:uncertainRequirement.participantId,topic:uncertainRequirement.topic,facet:uncertainRequirement.facet,purpose:'practical',evidenceIds:[uncertainRequirement.id]}]};
    const family = context.memories.filter(memory => memory.topic === 'family' && memory.strength === 'requires');
    const parentRequired = family.find(memory => /(?:mother|father|parent).*(?:must|need|live)|must.*(?:mother|father|parent)/i.test(memory.text) && !/never live/i.test(memory.text));
    const parentRefused = family.find(memory => memory.participantId !== parentRequired?.participantId && /never live|(?:will not|won.t|cannot) live/i.test(memory.text) && /parent|mother|father/i.test(memory.text));
    if (parentRequired && parentRefused) return { decision: 'withhold', exploration: 'hold', reason: 'Scripted demo: one person requires sharing a home with a parent; the other has a firm boundary against it.', evidenceIds: [parentRequired.id, parentRefused.id], clarifications: [] };
    const noChildren = family.find(memory => /(?:no|not want|never want|do not want|don.t want) (?:any )?(?:kids|children)|child.?free/i.test(memory.text));
    const wantsChildren = family.find(memory => memory.participantId !== noChildren?.participantId && /(?:want|have|having|raise) (?:my own |our own )?(?:kids|children)/i.test(memory.text) && !/(?:no|not|never|don.t|child.?free)/i.test(memory.text));
    if (noChildren && wantsChildren) return { decision: 'withhold', exploration: 'hold', reason: 'Scripted demo: the stated firm requirements about children conflict.', evidenceIds: [noChildren.id, wantsChildren.id], clarifications: [] };
    const planned = context.memories.find(memory => memory.facet === 'closeness.time' && memory.strength === 'prefers' && /planned dates|dates planned|plans? .*advance|scheduled dates/i.test(memory.text));
    const spontaneous = context.memories.find(memory => memory.participantId !== planned?.participantId && memory.facet === 'closeness.time' && memory.strength === 'prefers' && /spontan/i.test(memory.text));
    if (spontaneous && planned) return { decision: 'needs_clarification', exploration: 'allow', reason: 'Scripted demo: preferred dating rhythms differ without a firm exclusion; explore how they would make plans together.', evidenceIds: [spontaneous.id, planned.id], clarifications: [spontaneous, planned].map(memory => ({ participantId: memory.participantId, topic: memory.topic, facet: memory.facet, evidenceIds: [memory.id] })) };
    return { decision: 'propose', exploration: 'allow', reason: 'Scripted demo branch: both profiles have baseline coverage and no scripted children conflict. This is not a model compatibility assessment.', evidenceIds, clarifications: [] };
  }
  const latest = context.messages.filter(message => message.role === 'user').at(-1);
  const text = latest?.text || '';
  const result = { reply: '', memories: [], permissions: [], clarificationUpdates: [] };
  const clarification = context.clarifications.find(item => item.status === 'queued');
  const target = clarification?.topic || topics.find(topic => !context.memories.some(memory => memory.topic === topic && memory.status === 'confirmed')) || 'closeness';
  if (/(?:mother|father|parent).*(?:live|living|move|moving|stay)|(?:live|living|move|moving|stay).*(?:mother|father|parent)/i.test(text)) {
    const clear = /separate space/i.test(text) && /professional care/i.test(text) && /(?:not|no|don.t).*partner.*caregiv/i.test(text);
    for (const facetId of ['family.household', 'family.care']) {
      const existing = context.memories.find(memory => memory.facet === facetId);
      const tombstoned = context.memoryTombstones.some(memory => memory.facet === facetId);
      if (!existing?.userLocked && !existing?.locked && !tombstoned) result.memories.push({ ...(existing ? { id: existing.id } : {}), topic: 'family', facet: facetId, text: facetId === 'family.household' ? (clear ? 'My mother must be able to live with me with separate space.' : text) : (clear ? 'I will arrange professional care and do not expect partner caregiving.' : text), status: clear ? 'confirmed' : 'tentative', strength: facetId === 'family.household' && /dealbreaker|must|non.negotiable/i.test(text) ? 'requires' : clear ? 'accepts' : 'unknown', evidenceIds: [latest.id] });
    }
    if (clear && result.memories.some(memory => memory.facet === clarification?.facet)) result.clarificationUpdates.push({ id: clarification.id, status: 'answered', evidenceIds: [latest.id] });
    result.reply = clear ? 'Separate space and professional care make the expectation much clearer. What would you want to understand about a partner’s own family obligations?' : 'What would your partner be agreeing to: sharing a home, helping with care, or both? And what would you make room for if the roles were reversed?';
  } else result.reply = questions[target];
  if (task === 'understand') return { memories: result.memories, stories: [], profileUpdates: [], clarificationUpdates: result.clarificationUpdates, gaps: [] };
  return { reply: result.reply, permissions: [] };
}

export function createAgents({ mode = 'live', client = structuredResponse, config, versions = selectedVersions, timeoutMs = 120000 } = {}) {
  if (!['live', 'offline'].includes(mode)) throw new Error('Unknown agent mode.');
  const promptVersions = { ...selectedVersions, memy: '0.6.0', ...versions };
  async function run(task, args) {
    const context = contextFor(task, args);
    const role = task === 'review' ? 'matchy' : ['understand','summarize'].includes(task) ? 'memy' : 'astrid';
    const prompt = await applicationPrompt(role, promptVersions[role]);
    const started = Date.now();
    let result;
    if (mode === 'offline') result = { data: scripted(task, context), model: 'scripted-demo' };
    else {
      try {
        const settings = config || await configuration();
        const capabilities=[];let committed;
        const add=(name,description,parameters,execute)=>capabilities.push({name,description,parameters,execute});
        if(['understand','review','converse'].includes(task)) {
          add('inspect_records','Inspect current authorized records in one facet, or all. Returns full evidence-backed records; never other private conversations.',object({facet:enumeration(['all',...facets.map(f=>f.id)])}),async({facet})=>context.memories.filter(m=>facet==='all'||m.facet===facet));
        }
        if(task==='understand') {
          add('inspect_evidence','Read supplied own user evidence by message IDs. Assistant statements are not evidence.',object({messageIds:array(string,40)}),async({messageIds})=>{const found=context.messages.filter(m=>messageIds.includes(m.id)&&m.role==='user');if(found.length!==new Set(messageIds).size)throw Error('Evidence unavailable');return found;});
          if(args.commitUnderstanding)add('commit_understanding','Validate and atomically save this turn’s key learnings, profile facts and clarification updates. Call once, including for no changes. Inspect the receipt before finishing.',schemas.understand,async data=>{
            if(committed){if(committed.signature!==JSON.stringify(data))throw Error('Already committed');return committed.receipt;}
            const signature=JSON.stringify(data);validateReferences(task,data,context);const receipt=await args.commitUnderstanding(data);committed={signature,data:structuredClone(data),receipt};
            if(receipt.updates)context.memories=[...context.memories.filter(m=>!receipt.updates.some(u=>u.id===m.id)),...receipt.updates.map(cleanMemory)];
            if(receipt.profile)context.participant=ownProfile(receipt.profile);
            return {...receipt,...(receipt.profile?{profile:ownProfile(receipt.profile)}:{})};
          });
        }
        if(task==='review')add('check_review','Check your proposed disposition against evidence and readiness before finalizing. This does not publish a proposal or grant consent.',schemas.review,async data=>{validateReferences(task,data,context);if(context.phase==='preliminary'&&(data.decision==='propose'||data.exploration!=='hold'))return {accepted:false,reason:'Preliminary review can clarify or withhold, never introduce.'};return {accepted:true,publication:'The application will recheck current revisions and consent before applying your final decision.'};});
        if(task==='converse'&&args.actions){
          let matchingReceipt;
          add('inspect_matches','Read current participant-safe match dispositions and your own clarification topics. No private counterpart rationale.',object({}),async()=>args.actions.inspectMatches());
          add('request_matching','Queue a fresh background matching review when useful. A queued review is not a match or introduction.',object({}),async()=>matchingReceipt??=(await args.actions.requestMatching()));
          add('request_sharing_permission','Create an exact-recipient permission request for one of your supplied memories. This asks; it does not grant permission.',object({memoryId:string,recipientId:string}),async request=>{validateReferences('converse',{reply:'Permission request',permissions:[request]},context);return args.actions.requestPermission(request);});
        }
        result = await runAgent({input:[{role:'user',content:JSON.stringify({task,context})}],tools:capabilities,validate,timeoutMs,
          // Custom single-response adapters remain usable for isolated schema tests.
          acceptFinal:r=>!args.commitUnderstanding||!r.output||!!committed,
          request:options=>client({...settings,instructions:prompt.instructions,schema:schemas[task],task,...options})});
        if(committed)result.data=committed.data;

      } catch (error) {
        throw new Error(/^(API HTTP \d{3}|Agent response incomplete\.|Invalid agent response\.)$/.test(error.message) ? error.message : 'Agent request failed or timed out.');
      }
    }
    // Offline suggestions omit optional IDs; the wire format uses nullable required IDs.
    if (task === 'understand') for (const memory of [...(result.data?.memories || []), ...(result.data?.stories || [])]) {memory.id ??= null;memory.summary??=null;if(memory.facet)memory.readiness??=null;}
    if(task==='review')for(const clarification of result.data?.clarifications||[])clarification.purpose??='baseline';
    if (!validate(result.data, schemas[task])) throw new Error('Invalid agent response.');
    validateReferences(task, result.data, context);
    return { ...result.data, metadata: { mode, model: result.model || config?.model || 'gpt-6-astra',
      prompt: { role, version: promptVersions[role], hash: prompt.hash, assets: prompt.assets }, task,
      responseId: result.id || null, steps:result.steps||1, toolTrace:result.trace||[], usage: result.usage || null, durationMs: Date.now() - started,
      ...(mode === 'offline' ? { label: 'Scripted demo — not model output' } : {}) } };
  }
  return Object.fromEntries(Object.keys(schemas).map(task => [task, args => run(task, args)]));
}
