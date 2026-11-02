import { redirect } from 'next/navigation';

// 2.0: the follow-up queue lives on Today.
export default function FollowupsRedirect() {
  redirect('/');
}
