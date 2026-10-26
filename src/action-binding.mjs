/** Stable G1 declaration binding; no authority or execution. */
import schemas from './schemas.core.generated.mjs';
import * as validation from './validation.mjs';
import {createActionBinding} from './action-binding-factory.mjs';
export const {describeTaskAction,validateTaskActionBinding}=createActionBinding({schemas,validation,profile:'task-action/0.3'});
