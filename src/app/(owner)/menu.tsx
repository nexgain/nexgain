import { router } from 'expo-router';
import { View } from 'react-native';

import { ActionRow, Card, OwnerScreen, PageHeader } from '@/components/owner/ui';

// Owner screens that don't fit in the tab bar.
export default function OwnerMoreScreen() {
  return (
    <OwnerScreen>
      <PageHeader title="More" />
      <Card>
        <View>
          <ActionRow
            icon={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
            label="Analytics & Reports"
            onPress={() => router.navigate('/analytics')}
          />
          <ActionRow
            icon={{ ios: 'puzzlepiece.extension.fill', android: 'extension', web: 'extension' }}
            label="Integrations"
            onPress={() => router.navigate('/integrations')}
            showDivider
          />
        </View>
      </Card>
    </OwnerScreen>
  );
}
