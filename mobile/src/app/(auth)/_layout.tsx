import { Stack } from "expo-router";
import { RydrColors } from "@/constants/rydrTheme";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: RydrColors.canvas },
      }}
    />
  );
}
