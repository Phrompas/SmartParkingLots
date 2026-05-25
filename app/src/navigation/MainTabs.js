import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import LocationsScreen from "../screens/LocationsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import HistoryScreen from "../screens/HistoryScreen";
import { Image, View } from "react-native";

const Tab = createBottomTabNavigator();

const ORANGE = "#D38C28";
const GRAY = "#A9A9A9";

export default function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,

        tabBarStyle: {
          height: 78,
          backgroundColor: "#fff",
          borderTopColor: "#eee",
          borderTopWidth: 1,
          paddingBottom: 10,
          paddingTop: 6,
        },
      }}
    >
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarAccessibilityLabel: "ประวัติ",

          tabBarIcon: ({ focused }) => (
            <Image
              source={require("../../assets/ic_qr.png")}
              style={{
                width: 26,
                height: 26,
                tintColor: focused ? ORANGE : GRAY,
              }}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Home"
        component={LocationsScreen}
        options={{
          tabBarAccessibilityLabel: "หน้าหลัก",

          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,

                backgroundColor: ORANGE,

                alignItems: "center",
                justifyContent: "center",

                marginTop: -12,

                shadowColor: "#000",
                shadowOpacity: 0.15,
                shadowRadius: 6,
                shadowOffset: {
                  width: 0,
                  height: 3,
                },

                elevation: 4,
              }}
            >
              <Image
                source={require("../../assets/ic_home.png")}
                style={{
                  width: 28,
                  height: 28,
                  tintColor: "#fff",
                }}
              />
            </View>
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarAccessibilityLabel: "โปรไฟล์",

          tabBarIcon: ({ focused }) => (
            <Image
              source={require("../../assets/ic_profile.png")}
              style={{
                width: 28,
                height: 28,
                tintColor: focused ? ORANGE : GRAY,
              }}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}