/** Stable portable declaration validation. */
import schemas from './schemas.core.generated.mjs';
import {createValidation} from './validation-factory.mjs';
export const MAX_INPUT_BYTES = 1048576;
function portableScope(s) {
 const exact=s.endsWith('/**')?s.slice(0,-3):s;
 // The only supported dot-prefixed root is explicitly declared .github.
  // Other hidden segments and traversal paths remain invalid.
  return exact.length>0 && exact.split('/').every((p,i)=>
    (i===0 && p==='.github') || (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(p) && p!=='.' && p!=='..'));
}
function scopeContains(allowedScope,requestedScope) {
 if(typeof allowedScope!=='string'||typeof requestedScope!=='string'||!portableScope(allowedScope)||!portableScope(requestedScope))return false;
 const allowedTree=allowedScope.endsWith('/**'),requestedTree=requestedScope.endsWith('/**');
 const allowedBase=allowedTree?allowedScope.slice(0,-3):allowedScope;
 const requestedBase=requestedTree?requestedScope.slice(0,-3):requestedScope;
 if(!allowedTree)return !requestedTree && requestedBase===allowedBase;
 return requestedBase===allowedBase || requestedBase.startsWith(allowedBase+'/');
}

const validation=createValidation({schemas,portableScope,scopeContains});
export const {read,checkBundle,checkTask}=validation;
export {scopeContains};
