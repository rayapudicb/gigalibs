// @gigalibs/cmms-web (WI-OI-083b): the CMMS module's web package. Its pages are declared in the module manifest
// (`spec.ui.pages`) and generated into the shell; the shell never hand-wires CMMS screens.
export { CmmsWorkspace, type CmmsSection } from './components/CmmsWorkspace';
export { CmmsSpaceExplorer } from './components/CmmsSpaceExplorer';
export { cmmsApi, requestCmms, type CmmsApiError } from './api';
