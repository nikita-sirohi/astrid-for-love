const $ = (selector) => document.querySelector(selector);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
const append = (node, ...children) => { node.append(...children.filter(Boolean)); return node; };
const button = (label, className, action) => { const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', action); return node; };
let bootstrap, activeId, data, view = 'people', conversation = 'astrid', panel = 'memory', sending = false, refreshing = false;
let chatSignature = '', knowledgeSignature = '', presenterSignature = '', toastTimer;
const drafts = new Map();
const expandedHistories = new Set();
const participant = (id) => bootstrap?.participants.find(p => p.id === id);
const name = (id) => participant(id)?.name || id;
const topicLabel = (id) => bootstrap.topics.find(t => t.id === id)?.label || id;
const facetLabel = (id) => bootstrap.facets?.find(f => f.id === id)?.label;
const profileFieldLabel = (id) => ({age:'Age',location:'Location',gender:'Gender',interestedIn:'Interested in dating',ageRange:'Preferred age range',pronouns:'Pronouns'})[id] || 'Profile detail';
const profileValue = (value) => Array.isArray(value) ? value.join(', ') : String(value ?? 'Not yet shared');
function avatar(person, className = '') {
  if (!person || person.id === 'astrid') return el('span', `avatar astrid-avatar ${className}`, '✳');
  const image = el('img', `avatar ${className}`); image.src = person.photo || ''; image.alt = person.name; image.style.objectPosition = person.photoPosition || 'center';
  image.addEventListener('error', () => image.replaceWith(el('span', `avatar ${className}`, person.name?.slice(0, 1) || '?')), {once:true});
  return image;
}
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4200); }
function showError(message, retry) { const box = $('#error'); box.replaceChildren(el('span', '', message)); if(retry) box.append(button('Try again', 'text-button', retry)); box.append(button('Dismiss', 'text-button', () => box.hidden = true)); box.hidden = false; }
async function api(path, options = {}, actor = activeId) {
  const response = await fetch(path, { ...options, headers: {'Content-Type':'application/json', ...(actor ? {'X-Participant-Id':actor} : {}), ...options.headers}, body: options.body == null ? undefined : JSON.stringify(options.body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}
async function mutate(path, method, body, success) {
  try { const result = await api(path, {method, body}); if (success) toast(success); await refresh(true); return result; }
  catch(error) { showError(error.message); throw error; }
}
function draftKey() { return `${activeId}/${conversation}`; }
function saveDraft() { if(activeId) drafts.set(draftKey(), $('#message-input').value); }
function resetSignatures() { chatSignature = ''; knowledgeSignature = ''; }
function selectConversation(id) { saveDraft(); conversation = id; $('#message-input').value = drafts.get(draftKey()) || ''; chatSignature = ''; render(); }
async function selectParticipant(id) {
  if(id === activeId) return; saveDraft(); activeId = id; localStorage.setItem('astrid-demo-participant', id); conversation = 'astrid'; data = null; resetSignatures();
  $('#message-input').value = drafts.get(draftKey()) || ''; renderTabs(); $('#chat-content').replaceChildren(el('p','empty-state','Getting your corner ready…')); $('#knowledge').replaceChildren();
  await refresh(true);
}
function renderTabs() {
  $('#participants').replaceChildren(...bootstrap.participants.map(p => { const b = button('', `participant-tab ${p.id === activeId ? 'active' : ''}`, () => selectParticipant(p.id)); b.setAttribute('aria-pressed', String(p.id === activeId)); return append(b, avatar(p), el('span','',p.name.split(' ')[0])); }));
}
function renderNav() {
  const nav = $('#conversation-nav');
  const item = (id, person, title, subtitle) => append(button('',`conversation-button ${conversation === id ? 'active' : ''}`,() => selectConversation(id)),avatar(person),append(el('span'),el('strong','',title),el('small','',subtitle)));
  nav.replaceChildren(item('astrid',null,'Astrid','Your matchmaking friend'), el('p','section-label','YOUR CONNECTIONS'));
  for(const chat of data.chats) nav.append(item(chat.id,chat.other,chat.other.name.split(' ')[0],'Just the two of you'));
  if(!data.chats.length) nav.append(el('p','nav-empty','Something good starts with a conversation. Your connections will land here.'));
  const pending = data.proposals.filter(p => p.status === 'pending').length;
  if(pending) nav.append(item('proposals',{id:'astrid'},'A little spark',`${pending} introduction${pending === 1 ? '' : 's'} to consider`));
}
function renderHeading() {
  const h = $('#chat-heading'); const chat = data.chats.find(c => c.id === conversation);
  h.replaceChildren(avatar(chat?.other), append(el('div'),el('h1','',chat ? chat.other.name : conversation === 'proposals' ? 'A little spark' : 'Astrid'),el('p','',chat ? 'Introduced by Astrid. The rest is yours.' : 'Curious about the whole you.')));
  if(chat) h.append(button('Check in privately ↗','button light small inline-checkin', async () => {
    const actor = activeId; const b = h.querySelector('button'); b.disabled = true;
    try { await api(`/api/participants/${actor}/checkin`,{method:'POST',body:{chatId:chat.id}},actor); if(actor === activeId) { selectConversation('astrid'); await refresh(true); } toast('Your private check-in is ready.'); }
    catch(error) { showError(error.message); } finally { b.disabled = false; }
  })); else h.append(el('span','chat-label','YOUR MATCHMAKING FRIEND'));
  $('#composer').hidden = conversation === 'proposals';
  $('#message-input').placeholder = chat ? `Say something to ${chat.other.name.split(' ')[0]}…` : 'Tell Astrid what’s on your mind…';
  $('#composer-note').textContent = chat ? 'Astrid has left this chat. This conversation stays between you two.' : 'Just between you and Astrid.';
  $('#typing').hidden = !(conversation === 'astrid' && (data.busy || sending));
  $('#send').disabled = sending || (conversation === 'astrid' && data.busy);
}
function messageNode(message) {
  if(message.role === 'system' || message.authorId === 'system') return el('div','system-message',message.text);
  const own = message.authorId === activeId;
  const item = el('article',`message ${own ? 'own' : ''}`);
  if(!own) item.append(avatar(message.authorId === 'astrid' ? null : participant(message.authorId)));
  const body = el('div','message-body');
  if(!own) body.append(el('div','message-name',message.authorId === 'astrid' ? 'ASTRID' : name(message.authorId).toUpperCase()));
  body.append(el('div','message-text',message.text)); item.append(body); return item;
}
function proposalNode(proposal) {
  const other = proposal.other || participant(proposal.participantIds.find(id => id !== activeId));
  const card = el('article','proposal-card');
  if(other?.photo) { const photo = el('img','proposal-photo'); photo.src = other.photo; photo.alt = `Portrait of ${other.name}`; photo.style.objectPosition = other.photoPosition || 'center'; card.append(append(el('div','proposal-image'),photo)); }
  const body = el('div','proposal-details'); body.append(el('span','eyebrow','A PERSON WORTH MEETING'),el('h2','',`${other?.name || 'Your connection'}${other?.age ? `, ${other.age}` : ''}`),el('p','location', [other?.location,other?.pronouns].filter(Boolean).join(' · ')),el('p','intro',proposal.introductions?.[activeId] || other?.bio || 'Astrid thinks you two might have something to talk about.'));
  if(other?.interests?.length) body.append(el('p','location',other.interests.join(' · ')));
  const mine = proposal.decisions?.[activeId];
  const actions = el('div','proposal-actions');
  const decision = async (value) => {
    [...actions.querySelectorAll('button')].forEach(b => b.disabled = true);
    try { await mutate(`/api/proposals/${proposal.id}/decision`,'POST',{decision:value},value === 'accepted' ? 'Your yes is in. Introductions take two.' : 'Proposal withdrawn.'); } catch {} finally { [...actions.querySelectorAll('button')].forEach(b => b.disabled = false); }
  };
  if(proposal.status === 'pending') {
    if(mine === 'accepted') { body.append(el('p','proposal-status','You’re interested. Waiting for their yes before Astrid introduces you.')); actions.append(button('Withdraw my yes','button subtle small',()=>decision('withdrawn'))); }
    else actions.append(button('I’d like to meet them ↗','button',()=>decision('accepted')),button('No spark','button subtle',()=>declineDialog(proposal)));
    body.append(actions,el('p','fineprint','No pressure, no explanation needed. You’ll only share a chat if you both say yes.'));
  } else if(proposal.status === 'introduced') { body.append(el('p','proposal-status','Two yeses. You’ve been introduced.'),button('Open your conversation ↗','button',()=>selectConversation(proposal.chatId))); }
  else body.append(el('p','proposal-status',({declined:'This introduction isn’t going ahead.',withdrawn:'This proposal was withdrawn.',stale:'Your understanding changed. Astrid will take another look.'})[proposal.status] || proposal.status));
  card.append(body); return card;
}
function permissionNode(permission) {
  const card = el('div','permission-card');
  card.append(el('h3','','A story to share?'),el('p','',`May Astrid share this detail with ${name(permission.recipientId)}?`),el('p','',`“${permission.text}”`));
  const actions = el('div','proposal-actions');
  for(const [label,decision] of [['Yes, share this','granted'],['Keep it private','denied']]) actions.append(button(label,`button ${decision === 'denied' ? 'subtle' : ''} small`,async()=>{ try { await mutate(`/api/participants/${activeId}/permissions/${permission.id}`,'POST',{decision},decision === 'granted' ? 'Permission granted for this person and this detail.' : 'This stays private.'); } catch {} }));
  card.append(actions); return card;
}
function renderChat() {
  const chat = data.chats.find(c => c.id === conversation);
  if(conversation !== 'astrid' && conversation !== 'proposals' && !chat) conversation = 'astrid';
  const messages = chat?.messages || data.messages;
  const signature = JSON.stringify([activeId,conversation,messages, data.proposals, data.permissions]);
  if(signature === chatSignature) return; chatSignature = signature;
  const content = $('#chat-content'); const nearBottom = content.scrollHeight-content.scrollTop-content.clientHeight < 100; const oldScroll = content.scrollTop;
  content.replaceChildren();
  if(conversation === 'proposals') {
    content.append(el('div','date-divider','A LITTLE CURIOSITY GOES A LONG WAY'));
    for(const p of [...data.proposals].reverse()) content.append(proposalNode(p));
    if(!data.proposals.length) content.append(el('p','empty-state','No introductions yet. Keep getting to know Astrid.'));
  } else {
    content.append(el('div','date-divider',chat ? 'THE START OF SOMETHING' : 'YOUR STORY, STILL UNFOLDING'));
    if(!messages.length) content.append(append(el('div','empty-chat'),el('span','asterisk','✳'),el('h2','','You bring the stories. I’ll bring the curiosity.'),el('p','','Tell me something about your week. A tiny victory, a strong opinion, a very good distraction. We’ll start there.')));
    const prepared = messages.filter(message => message.fixture);
    if(prepared.length) {
      const history = el('details','prepared-history');
      const historyKey = draftKey();
      history.open = expandedHistories.has(historyKey);
      history.addEventListener('toggle', () => history.open ? expandedHistories.add(historyKey) : expandedHistories.delete(historyKey));
      history.append(el('summary','','Prepared fictional conversation'));
      const transcript = el('div','prepared-transcript');
      for(const message of prepared) transcript.append(messageNode(message));
      history.append(transcript); content.append(history);
    }
    for(const message of messages.filter(message => !message.fixture)) content.append(messageNode(message));
    if(!chat) {
      for(const permission of data.permissions.filter(p=>p.status === 'pending')) content.append(permissionNode(permission));
      for(const proposal of data.proposals.filter(p=>p.status === 'pending')) content.append(proposalNode(proposal));
    }
  }
  if(nearBottom || !oldScroll) content.scrollTop = content.scrollHeight; else content.scrollTop = oldScroll;
}
function renderKnowledge() {
  const signature = JSON.stringify([panel,data.memories,data.coverage,data.coverageDetails,data.profileConflicts,data.clarifications,data.participant]); if(signature === knowledgeSignature) return; knowledgeSignature = signature;
  const target = $('#knowledge'); target.replaceChildren(); $('#memory-tab').classList.toggle('selected',panel === 'memory'); $('#profile-tab').classList.toggle('selected',panel === 'profile');
  const conflicts=data.participant.profileConflicts || data.profileConflicts || [];
  if(conflicts.length) {
    const notice=el('aside','profile-conflicts'); notice.append(el('h3','','Let’s clear something up.'),el('p','','Something you told Astrid differs from your profile. Please check which details are right before your next introduction.'));
    for(const conflict of conflicts) {
      if(typeof conflict==='string') {notice.append(el('p','',conflict));continue;}
      notice.append(el('p','',`${profileFieldLabel(conflict.field)}: your profile says “${profileValue(data.participant[conflict.field])}”; Astrid heard “${profileValue(conflict.proposedValue)}”.`));
      if(conflict.field && Object.hasOwn(data.participant,conflict.field)) notice.append(button('Keep my profile value','text-button',async()=>{try {await mutate(`/api/participants/${activeId}/profile`,'PATCH',{[conflict.field]:data.participant[conflict.field]},'Your profile choice is confirmed.');}catch{}}));
    }
    notice.append(button('Check your profile','button subtle small',profileDialog)); target.append(notice);
  }
  if(panel === 'profile') { renderProfile(target); return; }
  const count = bootstrap.topics.filter(t=>data.coverage[t.id]).length;
  const coverage = el('div','coverage'); coverage.append(append(el('div','coverage-heading'),el('span','','Getting to know you'),el('span','',`${count} / ${bootstrap.topics.length} areas explored`)));
  const bars = el('div','coverage-bars'); for(const topic of bootstrap.topics) { const bar = el('span',data.coverage[topic.id] ? 'covered' : ''); bar.title = topic.label; bars.append(bar); } coverage.append(bars,el('p','','A little direction for Astrid, not a score for you.')); target.append(coverage);
  for(const topic of bootstrap.topics) {
    const group = el('section','memory-group'); group.append(append(el('div','topic-heading'),el('h3','',topic.label),el('span','',data.coverage[topic.id] ? '✓' : '○')));
    const memories = data.memories.filter(m=>m.topic === topic.id && !m.deleted);
    if(!memories.length) group.append(el('p','topic-empty','Room for a conversation.'));
    for(const memory of memories) {
      const card = el('article','memory-card'); const meta = el('div','memory-meta');
      if(facetLabel(memory.facet)) card.append(el('h4','memory-facet',facetLabel(memory.facet)));
      meta.append(el('span',`tag ${memory.status}`,memory.status === 'confirmed' ? 'Confirmed' : 'Astrid’s read'),el('span','tag',({requires:'Firm requirement',prefers:'Preference',accepts:'Open to',unknown:'Still exploring'})[memory.strength] || memory.strength),el('span','tag',memory.sharing === 'shareable' ? 'Shareable' : 'Private'));
      card.append(meta,el('p','',memory.text),append(el('div','memory-actions'),button('Edit','text-button',()=>memoryDialog(memory)),button('Remove','text-button',()=>removeMemory(memory)),memory.sharing === 'private' ? button('Sharing permission','text-button',()=>permissionDialog(memory)) : null)); group.append(card);
    }
    const unexplored=(bootstrap.facets||[]).filter(f=>f.topic===topic.id && data.coverageDetails && !data.coverageDetails[f.id]);
    if(unexplored.length) group.append(el('p','topic-empty',`Still getting to know: ${unexplored.map(f=>f.label.toLowerCase()).join(', ')}.`));
    target.append(group);
  }
  target.append(button('+ Add something Astrid should know','button subtle add-memory',()=>memoryDialog()));
}
function renderProfile(target) {
  const p = data.participant; const card = el('div','profile-details'); if(p.photo) { const img = el('img'); img.src = p.photo; img.alt = p.name; img.style.objectPosition = p.photoPosition || 'center'; card.append(img); }
  card.append(el('h3','',`${p.name}, ${p.age}`),el('p','',[p.location,p.pronouns].filter(Boolean).join(' · ')),el('p','',p.bio));
  const dl = el('dl'); for(const [label,value] of [['Gender',p.gender || 'Not yet shared'],['Interested in dating',p.interestedIn?.join(', ') || 'Not yet shared'],['Age range',p.ageRange?.join('–') || 'Not yet shared'],['Matching',p.matchingEnabled ? 'Open to introductions' : 'Paused']]) dl.append(el('dt','',label),el('dd','',value)); card.append(dl,button('Edit your profile','button subtle',profileDialog)); target.append(card);
}
function render() { if(!data) return; renderTabs(); renderNav(); renderHeading(); renderChat(); renderKnowledge(); }
function field(label,type,value,options) {
  const wrap = el('label','field',label); const input = el(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input');
  if(type === 'select') for(const [id,name] of options) { const option = el('option','',name); option.value = id; input.append(option); }
  else if(type !== 'textarea') input.type = type;
  if(type === 'checkbox') input.checked = Boolean(value); else input.value = value ?? '';
  wrap.append(input); return {wrap,input};
}
function dialog(title,description,fields,saveLabel,onSave) {
  const dialog = $('#editor'), form = $('#editor-form'); form.replaceChildren(el('h2','',title),el('p','',description),...fields.map(f=>f.wrap));
  const cancel = button('Cancel','button subtle',()=>dialog.close()); const submit = el('button','button',saveLabel); submit.type = 'submit'; form.append(append(el('div','dialog-actions'),cancel,submit));
  form.onsubmit = async e => { e.preventDefault(); submit.disabled = true; try { await onSave(); dialog.close(); } catch {} finally { submit.disabled = false; } }; dialog.showModal();
}
function memoryDialog(memory) {
  const topic = field('Area','select',memory?.topic || bootstrap.topics[0].id,bootstrap.topics.map(t=>[t.id,t.label]));
  const facet=field('What part of this?','select','',[]);
  const updateFacets=()=>{ facet.input.replaceChildren(); const choices=(bootstrap.facets||[]).filter(f=>f.topic===topic.input.value); for(const f of choices) {const option=el('option','',f.label);option.value=f.id;facet.input.append(option);} if(choices.some(f=>f.id===memory?.facet)) facet.input.value=memory.facet; facet.wrap.hidden=!choices.length; };
  topic.input.addEventListener('change',updateFacets);updateFacets();
  const text = field('What should Astrid understand?','textarea',memory?.text); text.input.required = true;
  const strength = field('How firm is this?','select',memory?.strength || 'unknown',[['requires','A firm requirement'],['prefers','A preference'],['accepts','Something I’m open to'],['unknown','Still figuring it out']]);
  const sharing = field('Sharing','select',memory?.sharing || 'private',[['private','Keep private'],['shareable','Astrid may use this in introductions']]);
  dialog(memory ? 'Let’s get you right.' : 'In your own words.','Your edits guide future conversations and matching. Past messages stay as they were.',[topic,facet,text,strength,sharing],'Save understanding',()=>mutate(`/api/participants/${activeId}/memories${memory ? `/${memory.id}` : ''}`,memory ? 'PATCH' : 'POST',{topic:topic.input.value,...(facet.input.value?{facet:facet.input.value}:{}),text:text.input.value.trim(),status:'confirmed',strength:strength.input.value,sharing:sharing.input.value},'Understanding updated.'));
}
function removeMemory(memory) { dialog('Forget this detail?','Astrid will stop using this understanding. The original conversation stays in your history.',[], 'Remove understanding',()=>mutate(`/api/participants/${activeId}/memories/${memory.id}`,'DELETE',undefined,'Understanding removed.')); }
function permissionDialog(memory) {
  const recipient = field('Who may hear this?','select',undefined,bootstrap.participants.filter(p=>p.id !== activeId).map(p=>[p.id,p.name]));
  dialog('A particular person, a particular detail.',`“${memory.text}” — This creates a permission request in your private chat, where you can approve or decline it.`,[recipient],'Create request',async()=>{ await mutate(`/api/participants/${activeId}/permissions`,'POST',{memoryId:memory.id,recipientId:recipient.input.value}); selectConversation('astrid'); });
}
function profileDialog() {
  const age=field('Your age','number',data.participant.age);age.input.min=18;age.input.max=120;age.input.required=true;
  const location=field('Where you live','text',data.participant.location);location.input.required=true;
  const p=data.participant; const gender=field('Your gender, in your words','text',p.gender); const pronouns=field('Pronouns','text',p.pronouns); const attracted=field('Genders you’re interested in dating (comma-separated)','text',p.interestedIn?.join(', ')); const minimum=field('Minimum age (18+)','number',p.ageRange?.[0]||18); minimum.input.min=18; const maximum=field('Maximum age','number',p.ageRange?.[1]||99); maximum.input.min=18; const bio=field('A little about you · shareable','textarea',p.bio); const enabled=field('Open to introductions','checkbox',p.matchingEnabled);
  dialog('Your kind of connection.','No assumptions. Tell Astrid who you’re interested in meeting.',[age,location,gender,pronouns,attracted,minimum,maximum,bio,enabled],'Save profile',async()=>{
    const ageRange=[Number(minimum.input.value),Number(maximum.input.value)]; if(ageRange[0]<18||ageRange[1]<ageRange[0]) { showError('Please enter an adult age range with the maximum at least the minimum.'); throw new Error('Invalid age range'); }
    const values={age:Number(age.input.value),location:location.input.value.trim(),gender:gender.input.value.trim(),pronouns:pronouns.input.value.trim(),interestedIn:attracted.input.value.split(',').map(s=>s.trim()).filter(Boolean),ageRange,bio:bio.input.value.trim(),matchingEnabled:enabled.input.checked};
    const changes=Object.fromEntries(Object.entries(values).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(p[key])));
    if(Object.keys(changes).length) await mutate(`/api/participants/${activeId}/profile`,'PATCH',changes,'Profile updated.');
  });
}
function declineDialog(proposal) {
  const feedback=field('Anything you’d like Astrid to know? (optional)','textarea','');
  dialog('No spark is enough.','You don’t owe an explanation. Anything you share here stays between you and Astrid.',[feedback],'Pass on this introduction',()=>mutate(`/api/proposals/${proposal.id}/decision`,'POST',{decision:'declined',feedback:feedback.input.value.trim()},'Got it. No pressure.'));
}
async function refresh(force = false) {
  if(refreshing && !force) return; refreshing=true; const actor=activeId;
  try { if(view === 'presenter') { const result=await api('/api/presenter'); if(view === 'presenter') renderPresenter(result); }
    else { const result=await api(`/api/participants/${actor}`); if(actor===activeId && view==='people') { data=result; render(); } }
  } catch(error) { if(force) showError(error.message,()=>refresh(true)); } finally { refreshing=false; }
}
async function startMatching() { const b=$('#review-matches'); b.disabled=true; try { await mutate(`/api/participants/${activeId}/matching`,'POST',{},'Astrid is taking a look. You can keep chatting.'); } catch {} finally { b.disabled=false; } }
function renderPresenter(result) {
  const signature=JSON.stringify([result,activeId]); if(signature===presenterSignature) return; presenterSignature=signature;
  const root=$('#presenter'); root.replaceChildren(el('span','eyebrow','PRESENTER VIEW · FICTIONAL DEMO DATA'),el('h1','','The thinking behind the spark.'),el('p','','A separate view of matching decisions, open questions, and background work. Participants only see their own conversations and approved introductions.'));
  const controls=el('div','presenter-controls'); controls.append(button(`Review matches for ${name(activeId).split(' ')[0]} ↗`,'button',startMatching),button('Reset fictional demo','button subtle',()=>dialog('Start the demo fresh?','This resets the application’s fictional people, chats, and matches. Prompt-lab sessions are kept.',[],'Reset demo',async()=>{ await mutate('/api/demo/reset','POST',{},'Demo reset.'); resetSignatures(); presenterSignature=''; await refresh(true); })));
  root.append(controls);
  const stats=el('div','stats'); for(const [label,value] of Object.entries(result.counts || {})) { if(typeof value==='number') stats.append(append(el('div','stat'),el('strong','',value),el('span','',label))); } root.append(stats);
  const grid=el('div','presenter-grid'), reviews=el('section'), jobs=el('section'); reviews.append(el('h2','','Matching decisions')); jobs.append(el('h2','','Background work'));
  for(const review of [...result.reviews].reverse()) {
    const card=el('article','review-card'); card.append(el('span','tag',({propose:'A promising connection',needs_clarification:'A question worth asking',withhold:'Holding this introduction'})[review.decision] || review.decision),el('h3','',review.participantIds.map(name).join(' + ')),el('p','',review.reason));
    for(const c of review.clarifications || []) {card.append(el('p','',`${name(c.participantId)} · ${c.uncertainty || `Explore ${topicLabel(c.topic).toLowerCase()}`}`));if(c.completionCondition) card.append(el('p','',`What would settle it: ${c.completionCondition}`));}
    const details=el('details'); details.append(el('summary','','Evidence & version record'),el('pre','',JSON.stringify({evidence:review.evidenceIds,revisions:review.revisions,model:review.metadata?.model || review.model,prompt:review.metadata?.prompt || review.prompt},null,2))); card.append(details); reviews.append(card);
  }
  if(!result.reviews.length) reviews.append(el('p','empty-state','No reviews yet. Start one above, or keep talking with Astrid.'));
  for(const job of [...result.jobs].reverse()) { const card=el('article','job-card'); card.append(el('span','tag',job.status),el('h3','',`Matching · ${name(job.participantId)}`),el('p','',new Date(job.createdAt).toLocaleString())); if(job.error) card.append(el('p','',job.error)); jobs.append(card); }
  if(!result.jobs.length) jobs.append(el('p','empty-state','Nothing queued. New understanding can start a matching review.'));
  grid.append(reviews,jobs); root.append(grid);
}
$('#composer').addEventListener('submit',async event=>{
  event.preventDefault(); if(sending || (conversation==='astrid'&&data?.busy)) return; const text=$('#message-input').value.trim(); if(!text) return;
  const actor=activeId, chat=conversation, key=draftKey(); sending=true; renderHeading();
  try {
    const result=await api(chat==='astrid' ? `/api/participants/${actor}/messages` : `/api/chats/${chat}/messages`,{method:'POST',body:{text}},actor);
    // Keep anything the person began writing while this request was in flight.
    if((drafts.get(key) || '').trim() === text) drafts.delete(key);
    if(actor===activeId&&chat===conversation && $('#message-input').value.trim() === text) $('#message-input').value='';
    if(result.error) showError(`${result.error} Your message was saved. Send a follow-up when you’re ready to try again.`);
    await refresh(true);
  } catch(error) { showError(`${error.message} Your draft is kept below. Check the conversation before retrying.`,()=>refresh(true)); }
  finally { sending=false; if(data) renderHeading(); }
});
$('#message-input').addEventListener('input',saveDraft);
$('#message-input').addEventListener('keydown',event=>{ if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing) { event.preventDefault(); $('#composer').requestSubmit(); } });
$('#review-matches').addEventListener('click',startMatching);
$('#memory-tab').addEventListener('click',()=>{ panel='memory'; renderKnowledge(); });
$('#profile-tab').addEventListener('click',()=>{ panel='profile'; renderKnowledge(); });
function setView(next) { saveDraft(); view=next; $('#workspace').hidden=next!=='people'; $('#presenter').hidden=next!=='presenter'; $('#people-view').classList.toggle('nav-active',next==='people'); $('#presenter-view').classList.toggle('nav-active',next==='presenter'); refresh(true); }
$('#people-view').addEventListener('click',()=>setView('people')); $('#presenter-view').addEventListener('click',()=>setView('presenter'));
async function init() { try { bootstrap=await api('/api/bootstrap'); activeId=bootstrap.participants.find(p=>p.id===localStorage.getItem('astrid-demo-participant'))?.id || bootstrap.participants[0]?.id; if(!activeId) throw new Error('No demo participants are available.'); $('#mode').textContent=bootstrap.mode==='offline'?'SCRIPTED DEMO · LOCAL STORAGE':'LIVE ASTRID · LOCAL STORAGE'; renderTabs(); await refresh(true); setInterval(()=>{ if(!document.hidden) refresh(); },3000); } catch(error) { showError(error.message,init); } }
init();
