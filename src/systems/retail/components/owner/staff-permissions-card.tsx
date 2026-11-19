// Owner > Employees > a staff member (NexGain Retail): what they can do from
// the Scanner tab. Everyone can look products up; each stock action can be
// turned on or off. Staff never see cost prices or profit margins.
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { SwitchRow } from '@/systems/retail/components/owner/form';
import { Card } from '@/systems/retail/components/owner/ui';
import { Colors as C } from '@/constants/theme';
import {
  ACTION_LABELS,
  DEFAULT_PERMISSIONS,
  loadPermissions,
  savePermissions,
  STAFF_ACTIONS,
  type StaffAction,
  type StaffPermissions,
} from '@/systems/retail/data/staff-permissions';

export function StaffPermissionsCard({ employeeId, firstName }: { employeeId: string; firstName: string }) {
  const [perms, setPerms] = useState<StaffPermissions | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadPermissions(employeeId).then((p) => live && setPerms(p));
    return () => {
      live = false;
    };
  }, [employeeId]);

  async function toggle(action: StaffAction, on: boolean) {
    const before = perms ?? DEFAULT_PERMISSIONS;
    const next = { ...before, [action]: on };
    setPerms(next);
    const error = await savePermissions(employeeId, next);
    if (error) {
      setPerms(before);
      setMessage(error);
    } else setMessage(null);
  }

  return (
    <Card title="Scanner Permissions" icon={{ ios: 'barcode.viewfinder', android: 'qr_code_scanner', web: 'qr_code_scanner' }}>
      <Text style={styles.muted}>
        {firstName} can always scan and look products up (prices and stock). Choose what else they can record. They never see cost prices or margins.
      </Text>
      {STAFF_ACTIONS.map((a) => (
        <SwitchRow
          key={a}
          label={ACTION_LABELS[a].owner}
          hint={ACTION_LABELS[a].hint}
          value={(perms ?? DEFAULT_PERMISSIONS)[a]}
          onChange={(on) => toggle(a, on)}
          disabled={!perms}
        />
      ))}
      {message && <Text style={styles.error}>{message}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  muted: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },
  error: { color: C.danger, fontSize: 14, fontWeight: '600' },
});
