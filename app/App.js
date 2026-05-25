import React, { useContext } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthContext, AuthProvider } from "./src/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import MainTabs from "./src/navigation/MainTabs";
import AdminTabs from "./src/navigation/AdminTabs";
import { ActivityIndicator, Text, View } from "react-native";

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { authReady, isAuthenticated } = useContext(AuthContext);

  if (!authReady) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FFFFFF",
          paddingHorizontal: 24,
        }}
      >
        <ActivityIndicator size="large" color="#FF7A00" />
        <Text style={{ marginTop: 12, color: "#6B7280", fontWeight: "700" }}>
          กำลังเตรียมระบบ...
        </Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="AdminTabs" component={AdminTabs} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}