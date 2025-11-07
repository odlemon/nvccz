const str = "Yes this is done \n\n[DOCUMENTS:[{\\"fileName\\":\\"1762410955634-BUSINESS_PLAN (1).pdf\\",\\"fileUrl\\":\\"https://firebasestorage.googleapis.com/...\\",\\"fileSize\\":3861}]]\n\n[APPROVAL:APPROVED:cmhlnqd460001unnslmw98ry8:2025-11-06T22:08:05.855Z:Yes approve this]";
const regex = /\[DOCUMENTS:([\s\S]+?)\]/;
const match = str.match(regex);
console.log('match0', match && match[0]);
console.log('match1', match && match[1]);
if (match) {
  const raw = match[1];
  try { console.log('direct', JSON.parse(raw)); } catch (e) { console.log('direct error', e.message); }
  const normalized = raw.replace(/\\\"/g, '"').replace(/\\\\/g, '\\');
  console.log('normalized', normalized);
  try { console.log('normalized parse', JSON.parse(normalized)); } catch (e) { console.log('normalized error', e.message); }
  const sanitized = str.replace(match[0], '').trim();
  console.log('sanitized', sanitized);
}
