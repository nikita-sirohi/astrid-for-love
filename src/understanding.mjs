// Stable semantic questions, shared by memory, readiness, and privacy-safe agent handoffs.
const definitions = [
 ['dating.intent','dating','Relationship intention','What kind of relationship do you want?','Establish their current relationship intention, including explicit uncertainty.'],
 ['dating.structure','dating','Exclusivity and structure','What would exclusivity or dating other people mean in practice?','Establish the relationship structure they want or would accept.'],
 ['dating.availability','dating','Room for a relationship','What room can you make for a relationship?','Establish practical time and willingness to make room for dating.'],
 ['family.children','family','Children and future','What role do children have in the future you want?','Establish whether they have or want children, including being undecided.'],
 ['family.household','family','Family living arrangements','What family living arrangements would a partner need to accept?','Establish acceptable or required family living arrangements and a partner’s say.'],
 ['family.care','family','Care and family obligations','What family care or obligations would you expect a partner to share?','Distinguish their own obligations from work or sacrifices expected of a partner.'],
 ['ambition.work','ambition','Work and competing priorities','When work and a relationship compete, what would each person give?','Establish how ambition affects time, location, and reciprocal sacrifices.'],
 ['ambition.money','ambition','Money and autonomy','How should shared expenses and personal spending work?','Establish acceptable account arrangements, shared expenses, and financial autonomy.'],
 ['closeness.time','closeness','Time and affection','How would you share time, affection, and space?','Establish a practical expectation about closeness and independent time.'],
 ['closeness.privacy','closeness','Privacy and reassurance','What privacy and reassurance would you expect from each other?','Establish boundaries around access and reassurance without assuming consent.'],
 ['relationships.exes','relationships','Exes and past relationships','What role do exes have now, and what would a partner need to accept?','Establish relevant ex relationships and mutual boundaries, or explicit lack of relevance.'],
 ['relationships.friends','relationships','Friends and commitments','Which friendships must a relationship make room for?','Establish expectations about friendships, accommodation, and independence.'],
 ['repair.disagreement','repair','Handling disagreement','What happens when you and someone close want different things?','Establish practical behavior during disagreement rather than a communication slogan.'],
 ['repair.accountability','repair','Accountability and repair','What do you do after you hurt someone or get something wrong?','Establish how they take responsibility and attempt repair.'],
 ['convictions.beliefs','convictions','Beliefs in practice','Which beliefs shape the life a partner would share?','Establish consequential beliefs or explicit absence of required shared beliefs.'],
 ['convictions.flexibility','convictions','Differences and limits','Which differences can you live with, and where is the line?','Establish acceptable differences and firm limits.'],
];
export const facets=definitions.map(([id,topic,label,question,completionCondition])=>({id,topic,label,question,completionCondition}));
export const facetFor=id=>facets.find(f=>f.id===id);
export function coverageDetails(state,id) {
 const records=state.memories.filter(m=>m.participantId===id&&!m.deleted);
 return Object.fromEntries(facets.map(f=>[f.id,records.some(m=>m.facet===f.id&&m.status==='confirmed')&&!records.some(m=>m.facet===f.id&&m.status==='tentative')]));
}
export function safeClarification(item) {
 const f=facetFor(item.facet); if(!f)return null;
 return {id:item.id,participantId:item.participantId,topic:f.topic,facet:f.id,status:item.status,
  uncertainty:f.question,completionCondition:f.completionCondition,evidenceIds:item.evidenceIds||[],memoryRevisions:item.memoryRevisions||{}};
}
