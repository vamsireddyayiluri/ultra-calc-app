import type {
  V2ExtractionResult,
  V2RoomDimensionAssociation,
} from "../api/experimentalV2Client";

export type V2ApplicationAxis = "length" | "width";

export function eligibleV2Associations(
  result: V2ExtractionResult,
  roomId: string,
  axis: V2ApplicationAxis,
): V2RoomDimensionAssociation[] {
  const mapping = result.application_mappings.find((item) => item.room_id === roomId);
  if (!mapping) return [];
  const allowed = new Set(
    axis === "length"
      ? mapping.page_vertical_candidate_association_ids
      : mapping.page_horizontal_candidate_association_ids,
  );
  for (const associationId of (
    axis === "length"
      ? mapping.length_candidate_association_ids ?? []
      : mapping.width_candidate_association_ids ?? []
  )) {
    allowed.add(associationId);
  }
  const finalAxis = axis === "length" ? mapping.length : mapping.width;
  if (finalAxis.association_id) allowed.add(finalAxis.association_id);
  const dimensions = new Map(result.dimensions.map((item) => [item.dimension_id, item]));
  const observations = new Map(result.text_observations.map((item) => [item.observation_id, item]));
  return result.associations.filter((association) => {
    if (!allowed.has(association.association_id) || association.room_id !== roomId) return false;
    const dimension = dimensions.get(association.dimension_id);
    const verification = association.verification_observation_id
      ? observations.get(association.verification_observation_id)
      : undefined;
    return association.stage === "room_verification"
      && association.span_type === "room_span"
      && association.ownership_state === "supported"
      && association.verification_state === "machine_supported"
      && dimension?.origin === "printed"
      && dimension.read_state === "readable"
      && Boolean(dimension.raw_text?.trim())
      && Boolean(dimension.parsed)
      && Number.isFinite(dimension.parsed?.meters)
      && (dimension.parsed?.meters ?? 0) > 0
      && verification?.read_state === "readable"
      && Boolean(verification.raw_text.trim());
  });
}

export function isEligibleV2Association(
  result: V2ExtractionResult,
  roomId: string,
  axis: V2ApplicationAxis,
  associationId: string,
): boolean {
  return eligibleV2Associations(result, roomId, axis)
    .some((association) => association.association_id === associationId);
}
