import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { NutritionInfo, Nutriments } from '../types/nutrition';
import { computeHealthVerdict } from '../utils/healthVerdict';
import {
  nutriScoreColor,
  novaGroupLabel,
  novaGroupColor,
  nutrientLevel,
  nutrientLevelColor,
  type NutrientKey,
} from '../utils/nutritionScore';

interface Props {
  nutrition: NutritionInfo | null;
}

const TRAFFIC_LIGHT_ROWS: { key: NutrientKey; label: string; value: (n: Nutriments) => number | null }[] = [
  { key: 'sugars', label: 'Sugars', value: (n) => n.sugarsPer100g },
  { key: 'salt', label: 'Salt', value: (n) => n.saltPer100g },
  { key: 'saturatedFat', label: 'Saturated fat', value: (n) => n.saturatedFatPer100g },
  { key: 'fat', label: 'Fat', value: (n) => n.fatPer100g },
];

const STAT_ROWS: { label: string; value: (n: Nutriments) => number | null; unit: string }[] = [
  { label: 'Energy', value: (n) => n.energyKcalPer100g, unit: 'kcal' },
  { label: 'Fiber', value: (n) => n.fiberPer100g, unit: 'g' },
  { label: 'Protein', value: (n) => n.proteinsPer100g, unit: 'g' },
];

const INGREDIENTS_TRUNCATE_LENGTH = 150;

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

export function NutritionPanel({ nutrition }: Props) {
  const [ingredientsExpanded, setIngredientsExpanded] = useState(false);
  const verdict = computeHealthVerdict(nutrition);

  if (!nutrition || verdict.tier === 'unknown') {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nutrition</Text>
        <View style={[styles.verdictBanner, { backgroundColor: verdict.color }]}>
          <Text style={styles.verdictText}>{verdict.label}</Text>
        </View>
        <Text style={styles.emptyText}>Nutrition information not available for this product.</Text>
      </View>
    );
  }

  const { nutriScoreGrade, novaGroup, nutriments, allergens, additives, ingredientsText } = nutrition;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Nutrition</Text>
      <View style={[styles.verdictBanner, { backgroundColor: verdict.color }]}>
        <Text style={styles.verdictText}>{verdict.label}</Text>
      </View>

      {(nutriScoreGrade !== null || novaGroup !== null) && (
        <View style={styles.badgeRow}>
          {nutriScoreGrade !== null && (
            <View style={styles.badge}>
              <View style={[styles.badgePill, { backgroundColor: nutriScoreColor(nutriScoreGrade) }]}>
                <Text style={styles.badgePillText}>{nutriScoreGrade.toUpperCase()}</Text>
              </View>
              <Text style={styles.badgeCaption}>Nutri-Score</Text>
            </View>
          )}
          {novaGroup !== null && (
            <View style={styles.badge}>
              <View style={[styles.badgePill, { backgroundColor: novaGroupColor(novaGroup) }]}>
                <Text style={styles.badgePillText}>{novaGroup}</Text>
              </View>
              <Text style={styles.badgeCaption}>{novaGroupLabel(novaGroup)}</Text>
            </View>
          )}
        </View>
      )}

      {nutriments && (
        <View style={styles.card}>
          {TRAFFIC_LIGHT_ROWS.map(({ key, label, value }) => {
            const grams = value(nutriments);
            if (grams === null) return null;
            const level = nutrientLevel(key, grams);
            return (
              <View key={key} style={styles.statRow}>
                <Text style={styles.statLabel}>{label}</Text>
                <View style={styles.trafficLightValue}>
                  <Text style={styles.statValue}>{grams.toFixed(1)}g / 100g</Text>
                  <View style={[styles.dot, { backgroundColor: nutrientLevelColor(level) }]} />
                  <Text style={[styles.levelWord, { color: nutrientLevelColor(level) }]}>
                    {level ? capitalize(level) : ''}
                  </Text>
                </View>
              </View>
            );
          })}
          {STAT_ROWS.map(({ label, value, unit }) => {
            const v = value(nutriments);
            if (v === null) return null;
            return (
              <View key={label} style={styles.statRow}>
                <Text style={styles.statLabel}>{label}</Text>
                <Text style={styles.statValue}>{v.toFixed(1)}{unit === 'g' ? 'g' : ` ${unit}`} / 100g</Text>
              </View>
            );
          })}
        </View>
      )}

      {allergens.length > 0 && (
        <View style={styles.chipSection}>
          <Text style={styles.chipSectionTitle}>Allergens</Text>
          <View style={styles.chipRow}>
            {allergens.map((a) => (
              <View key={a} style={styles.allergenChip}>
                <Text style={styles.allergenChipText}>{capitalize(a)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {ingredientsText && (
        <View style={styles.ingredientsSection}>
          <Text style={styles.chipSectionTitle}>Ingredients</Text>
          <Text style={styles.ingredientsText}>
            {ingredientsExpanded || ingredientsText.length <= INGREDIENTS_TRUNCATE_LENGTH
              ? ingredientsText
              : `${ingredientsText.slice(0, INGREDIENTS_TRUNCATE_LENGTH)}…`}
          </Text>
          {ingredientsText.length > INGREDIENTS_TRUNCATE_LENGTH && (
            <TouchableOpacity onPress={() => setIngredientsExpanded((v) => !v)}>
              <Text style={styles.showMore}>{ingredientsExpanded ? 'Show less' : 'Show more'}</Text>
            </TouchableOpacity>
          )}
          {additives.length > 0 && (
            <Text style={styles.additivesCaption}>
              Additives: {additives.map(capitalize).join(', ')}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  verdictBanner: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'flex-start' },
  verdictText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyText: { fontSize: 13, color: '#94a3b8' },
  badgeRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  badge: { alignItems: 'center', gap: 4, maxWidth: 120 },
  badgePill: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badgePillText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  badgeCaption: { fontSize: 11, color: '#64748b', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginTop: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  statLabel: { fontSize: 14, color: '#64748b' },
  statValue: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  trafficLightValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  levelWord: { fontSize: 12, fontWeight: '700' },
  chipSection: { marginTop: 4, gap: 6 },
  chipSectionTitle: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  allergenChip: { backgroundColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  allergenChipText: { fontSize: 12, fontWeight: '700', color: '#92400e' },
  ingredientsSection: { marginTop: 4, gap: 4 },
  ingredientsText: { fontSize: 13, color: '#334155', lineHeight: 19 },
  showMore: { fontSize: 13, fontWeight: '600', color: '#2563eb' },
  additivesCaption: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
});
