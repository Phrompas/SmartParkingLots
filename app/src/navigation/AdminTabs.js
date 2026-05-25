import React from "react";
import { Image } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import AlertsScreen from "../screens/admin/AlertsScreen";
import MonitorScreen from "../screens/admin/MonitorScreen";
import ToolsScreen from "../screens/admin/ToolsScreen";

const Tab = createBottomTabNavigator();

// Keep theme aligned with User app (MainTabs)
const ORANGE = "#FF7A00";
const GRAY = "#9E9E9E";
const BG = "#FFFFFF";

export default function AdminTabs() {
  return (
    <Tab.Navigator
      initialRouteName="AdminMonitor"
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: ORANGE,
        tabBarInactiveTintColor: GRAY,
        tabBarStyle: { backgroundColor: BG, borderTopColor: "#EEE" },
        headerStyle: { backgroundColor: BG },
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tab.Screen
        name="AdminAlerts"
        component={AlertsScreen}
        options={{
          title: "Alerts",
          headerTitle: "Admin • Alerts",
          tabBarIcon: ({ focused }) => (
            <Image
              source={require("../../assets/ic_qr.png")}
              style={{ width: 24, height: 24, tintColor: focused ? ORANGE : GRAY }}
            />
          ),
        }}
      />

      <Tab.Screen
        name="AdminMonitor"
        component={MonitorScreen}
        options={{
          title: "Monitor",
          headerTitle: "Admin • Monitor",
          tabBarIcon: ({ focused }) => (
            <Image
              source={require("../../assets/ic_home.png")}
              style={{ width: 24, height: 24, tintColor: focused ? ORANGE : GRAY }}
            />
          ),
        }}
      />

      <Tab.Screen
        name="AdminTools"
        component={ToolsScreen}
        options={{
          title: "Tools",
          headerTitle: "Admin • Tools",
          tabBarIcon: ({ focused }) => (
            <Image
              source={require("../../assets/ic_profile.png")}
              style={{ width: 24, height: 24, tintColor: focused ? ORANGE : GRAY }}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
