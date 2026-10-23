import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import { ListItem, palette } from '@/components';

export interface DoctorOption {
  id: string;
  full_name: string | null;
  specialization: string | null;
}

interface Props {
  doctors: readonly DoctorOption[];
  selected: string | null;
  onSelect: (id: string) => void;
  /** Doctors already on the team, left out of the list. */
  excludeIds?: readonly string[];
}

/** Pick one doctor from a list (care team, new patient). */
export function DoctorChoice({ doctors, selected, onSelect, excludeIds = [] }: Props) {
  return (
    <View>
      {doctors
        .filter((d) => !excludeIds.includes(d.id))
        .map((d) => (
          <ListItem
            key={d.id}
            icon="doctor"
            title={d.full_name ?? '-'}
            description={d.specialization ?? undefined}
            onPress={() => onSelect(d.id)}
            right={
              <MaterialCommunityIcons
                name={selected === d.id ? 'radiobox-marked' : 'radiobox-blank'}
                size={24}
                color={selected === d.id ? palette.rose : palette.inkMuted}
              />
            }
          />
        ))}
    </View>
  );
}
