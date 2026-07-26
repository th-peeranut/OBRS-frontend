export enum REGISTER_OPTION {
  // OBRS-713 dropped 'USERNAME' = 1. EMAIL/PHONENUMBER keep their original values
  // on purpose — these numbers are passed between methods as plain arguments, so
  // renumbering to close the gap would silently re-map every call site.
  'EMAIL' = 2,
  'PHONENUMBER' = 3,
}
