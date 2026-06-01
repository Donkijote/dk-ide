export type { VcsStatusClient as GitStatusClient } from "@t3tools/client-runtime";
export type {
  VcsStatusState as GitStatusState,
  VcsStatusTarget as GitStatusTarget,
} from "./vcsStatusState";

export {
  getVcsStatusSnapshot as getGitStatusSnapshot,
  refreshVcsStatus as refreshGitStatus,
  resetVcsStatusStateForTests as resetGitStatusStateForTests,
  useVcsStatus as useGitStatus,
  watchVcsStatus as watchGitStatus,
} from "./vcsStatusState";
