/** Stable G2 declaration consistency only. */
import schemas from './schemas.adapters.generated.mjs';
import * as validation from './validation.mjs';
import {describeTaskAction} from './action-binding.mjs';
import {createFilesystemWriteMapping} from './filesystem-write-factory.mjs';
export const validateFilesystemWriteMapping=createFilesystemWriteMapping({schema:schemas['filesystem-write-mapping'],validation,describeTaskAction,profile:'filesystem-write/0.1',validActionPath:path=>!(/[^A-Za-z0-9/._-]/.test(path))&&validation.scopeContains(path,path)});
