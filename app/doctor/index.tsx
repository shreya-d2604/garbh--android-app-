import { Redirect } from 'expo-router';

/** /doctor opens the Today queue (the role router sends doctors here). */
export default function DoctorIndex() {
  return <Redirect href="/doctor/today" />;
}
