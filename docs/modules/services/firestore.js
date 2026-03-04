export const firestoreService = {
  addDocument: (...args) => window.App?.data?.addDocument?.(...args),
  updateDocument: (...args) => window.App?.data?.updateDocument?.(...args),
  deleteDocument: (...args) => window.App?.data?.deleteDocument?.(...args)
};
