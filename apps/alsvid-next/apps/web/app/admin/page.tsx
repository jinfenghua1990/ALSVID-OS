import { requireInternalPreviewSession } from '../_lib/portal-access';
import { Dashboard } from '../_components/dashboard';

export default async function AdminPortalPage() {
  const session = await requireInternalPreviewSession();
  return <Dashboard accountName={session.displayName} />;
}
