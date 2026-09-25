import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  useColorScheme,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Home, Users, Phone, BarChart2, MessageCircle } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import QuickActionsModal from './QuickActionsModal';

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

export default function CustomTabBar({ state, descriptors, navigation }: CustomTabBarProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme: storedTheme } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const [quickActionsVisible, setQuickActionsVisible] = useState(false);

  // Tab bar dimensions
  const floatOverhang = 22;
  const tabHeight = 62;
  const bottomPadding = Math.max(insets.bottom, 12);
  const totalHeight = tabHeight + bottomPadding + floatOverhang;

  // Geometry for the curved center scoop
  const cx = width / 2;
  const cutoutRadius = 38;
  const cutoutDepth = 24;

  const y0 = floatOverhang;
  const yBottom = floatOverhang + cutoutDepth;
  const p1x = cx - cutoutRadius - 14;
  const p2x = cx - cutoutRadius + 10;
  const p3x = cx - 22;
  const p4x = cx + 22;
  const p5x = cx + cutoutRadius - 10;
  const p6x = cx + cutoutRadius + 14;

  const svgPath = `
    M 0 ${y0}
    L ${p1x} ${y0}
    C ${p2x} ${y0}, ${p3x} ${yBottom}, ${cx} ${yBottom}
    C ${p4x} ${yBottom}, ${p5x} ${y0}, ${p6x} ${y0}
    L ${width} ${y0}
    L ${width} ${totalHeight}
    L 0 ${totalHeight}
    Z
  `;

  const strokePath = `
    M 0 ${y0}
    L ${p1x} ${y0}
    C ${p2x} ${y0}, ${p3x} ${yBottom}, ${cx} ${yBottom}
    C ${p4x} ${yBottom}, ${p5x} ${y0}, ${p6x} ${y0}
    L ${width} ${y0}
  `;

  const barBgColor = isDark ? '#181C24' : '#FFFFFF';
  const barBorderColor = isDark ? '#262D3D' : '#F0F2F5';

  const currentRouteName = state.routes[state.index]?.name;

  // Original tabs preserved with original icons
  const tabs = [
    {
      name: 'Home',
      label: 'Home',
      icon: Home,
    },
    {
      name: 'Leads',
      label: 'Leads',
      icon: Users,
    },
    {
      name: 'Calls',
      label: 'Calls',
      icon: Phone,
    },
    {
      name: 'Analytics',
      label: 'Analytics',
      icon: BarChart2,
    },
  ];

  const handleTabPress = (routeName: string) => {
    const isFocused = currentRouteName === routeName;
    const event = navigation.emit({
      type: 'tabPress',
      target: routeName,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  const renderTabButton = (tab: typeof tabs[0]) => {
    const isFocused = currentRouteName === tab.name;
    const IconComponent = tab.icon;

    // Visual styles matching the reference image:
    // Active item has bold dark black color, inactive has clean muted gray
    const activeColor = isDark ? '#FFFFFF' : '#111827';
    const inactiveColor = isDark ? '#6B7280' : '#8E8E93';

    return (
      <TouchableOpacity
        key={tab.name}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={tab.label}
        onPress={() => handleTabPress(tab.name)}
        style={styles.tabButton}
        activeOpacity={0.7}
      >
        <IconComponent
          size={24}
          color={isFocused ? activeColor : inactiveColor}
          strokeWidth={isFocused ? 2.3 : 1.75}
        />
        <Text
          style={[
            styles.tabLabel,
            {
              color: isFocused ? activeColor : inactiveColor,
              fontWeight: isFocused ? '700' : '500',
            },
          ]}
        >
          {tab.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View style={[styles.container, { height: totalHeight, marginTop: -floatOverhang }]}>
        {/* SVG Curved Background with soft drop shadow */}
        <View style={[StyleSheet.absoluteFill, styles.svgWrapper]}>
          <Svg width={width} height={totalHeight}>
            <Path d={svgPath} fill={barBgColor} />
            <Path
              d={strokePath}
              fill="none"
              stroke={barBorderColor}
              strokeWidth={1.5}
            />
          </Svg>
        </View>

        {/* Tab Buttons Row positioned below the overhang */}
        <View style={[styles.buttonsRow, { top: floatOverhang, height: tabHeight }]}>
          {/* Left pair: Home & Record */}
          <View style={styles.tabPair}>
            {renderTabButton(tabs[0])}
            {renderTabButton(tabs[1])}
          </View>

          {/* Center spacer reserving space for the scooped purple button */}
          <View style={styles.centerSpacer} />

          {/* Right pair: Booking & Profile */}
          <View style={styles.tabPair}>
            {renderTabButton(tabs[2])}
            {renderTabButton(tabs[3])}
          </View>
        </View>

        {/* Center Floating Purple Action Button */}
        <View
          style={[
            styles.floatingButtonContainer,
            {
              left: cx - 28,
              top: floatOverhang - 24, // Sits prominently elevated halfway above the scoop
            },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.floatingButton}
            onPress={() => setQuickActionsVisible(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Quick Actions"
          >
            <MessageCircle size={25} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Action Sheet Modal */}
      <QuickActionsModal
        visible={quickActionsVisible}
        onClose={() => setQuickActionsVisible(false)}
        navigation={navigation}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    zIndex: 99,
  },
  svgWrapper: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.07,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  buttonsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  tabPair: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  centerSpacer: {
    width: 66,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 4,
    letterSpacing: -0.1,
  },
  floatingButtonContainer: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  floatingButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
    }),
  },
});
