import { Redirect, useLocalSearchParams } from 'expo-router';

// Invite links (nexgain://join/CODE, or nexgain://join/CODE?invite=ID for a
// personal invite) open employee sign-up with the code filled in.
export default function JoinWithInvite() {
  const { code, invite } = useLocalSearchParams<{ code: string; invite?: string }>();
  return <Redirect href={{ pathname: '/employee-signup', params: invite ? { code, invite } : { code } }} />;
}
