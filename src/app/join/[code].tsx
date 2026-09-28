import { Redirect, useLocalSearchParams } from 'expo-router';

// Invite links (nexgain://join/CODE) open employee sign-up with the code filled in.
export default function JoinWithInvite() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: '/employee-signup', params: { code } }} />;
}
