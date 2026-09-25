import React from 'react';
import { Image, StyleSheet } from 'react-native';

const logo = require('../assets/images/icon.png');

export function BrandLogo() {
  return <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="Logo L’Univers des Saveurs" />;
}

const styles = StyleSheet.create({
  logo: {
    alignSelf: 'center',
    width: 118,
    height: 112,
    borderRadius: 18,
    marginBottom: 14,
  },
});