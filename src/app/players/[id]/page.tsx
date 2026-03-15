"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import { supabase } from "@/lib/supabase";
import useAdminStatus from "@/components/useAdminStatus";
import ConfirmModal from "@/components/ConfirmModal";
import InfoModal from "@/components/InfoModal";
import MessageModal from "@/components/MessageModal";

type Player = {
  id: string;
  display_name: string;
  full_name: string | null;
  date_of_birth?: string | null;
  phone_number?: string | null;
  phone_share_consent?: boolean | null;
  avatar_url?: string | null;
  is_archived?: boolean;
  location_id?: string | null;
  claimed_by?: string | null;
  age_band?: string | null;
  guardian_consent?: boolean | null;
  guardian_name?: string | null;
  guardian_email?: string | null;
  guardian_user_id?: string | null;
  rating_snooker?: number | null;
  peak_rating_snooker?: number | null;
  rated_matches_snooker?: number | null;
  snooker_handicap?: number | null;
  snooker_handicap_base?: number | null;
};
type AppUser = { id: string; email: string | null; linked_player_id?: string | null };
type Location = { id: string; name: string };
type MatchRow = {
  id: string;
  competition_id: string;
  match_mode: "singles" | "doubles";
  player1_id: string | null;
  player2_id: string | null;
  team1_player1_id: string | null;
  team1_player2_id: string | null;
  team2_player1_id: string | null;
  team2_player2_id: string | null;
  winner_player_id: string | null;
  status: "pending" | "in_progress" | "complete" | "bye";
  updated_at: string | null;
};
type Competition = { id: string; sport_type: "snooker"; competition_format: "knockout" | "league" };
type Frame = { match_id: string; winner_player_id: string | null; is_walkover_award: boolean };
type LeagueFixtureLite = {
  id: string;
  season_id?: string | null;
  fixture_date: string | null;
  week_no: number | null;
  home_team_id: string;
  away_team_id: string;
  home_points?: number | null;
  away_points?: number | null;
  status?: "pending" | "in_progress" | "complete" | null;
};
type LeagueTeamLite = { id: string; name: string };
type LeagueFrameLite = {
  fixture_id: string;
  slot_no: number;
  slot_type: "singles" | "doubles";
  home_player1_id: string | null;
  home_player2_id: string | null;
  away_player1_id: string | null;
  away_player2_id: string | null;
  winner_side: "home" | "away" | null;
  home_forfeit: boolean;
  away_forfeit: boolean;
  home_points_scored?: number | null;
  away_points_scored?: number | null;
};
type HandicapHistoryEntry = {
  id: string;
  player_id: string;
  fixture_id: string | null;
  season_id: string | null;
  change_type: "auto_result" | "manual_adjustment" | "manual_override" | "baseline_override";
  delta: number;
  previous_handicap: number;
  new_handicap: number;
  reason: string | null;
  created_at: string;
};

function pct(w: number, p: number) {
  if (!p) return 0;
  return Math.round((w / p) * 100);
}
function calculateAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(`${dob}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}
function deriveAgeBandFromDob(dob: string | null | undefined): "under_13" | "13_15" | "16_17" | "18_plus" {
  const age = calculateAge(dob);
  if (age === null) return "18_plus";
  if (age < 13) return "under_13";
  if (age < 16) return "13_15";
  if (age < 18) return "16_17";
  return "18_plus";
}
function displayPlayerName(player: Pick<Player, "full_name" | "display_name">) {
  return player.full_name?.trim() || player.display_name || "Unnamed player";
}

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [leagueFixtures, setLeagueFixtures] = useState<LeagueFixtureLite[]>([]);
  const [leagueTeams, setLeagueTeams] = useState<LeagueTeamLite[]>([]);
  const [leagueFrames, setLeagueFrames] = useState<LeagueFrameLite[]>([]);
  const [handicapHistory, setHandicapHistory] = useState<HandicapHistoryEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linkedEmail, setLinkedEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [editingPlayer, setEditingPlayer] = useState(false);
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [quickDobInput, setQuickDobInput] = useState("");
  const [savingQuickDob, setSavingQuickDob] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editDateOfBirth, setEditDateOfBirth] = useState("");
  const [editLocationId, setEditLocationId] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [editPhoneConsent, setEditPhoneConsent] = useState(false);
  const [editGuardianConsent, setEditGuardianConsent] = useState(false);
  const [editGuardianName, setEditGuardianName] = useState("");
  const [editGuardianEmail, setEditGuardianEmail] = useState("");
  const [editGuardianUserId, setEditGuardianUserId] = useState("");
  const [opponentDetail, setOpponentDetail] = useState<{ opponentId: string; opponentName: string } | null>(null);
  const [historyDetail, setHistoryDetail] = useState<{ fixtureId: string; title: string } | null>(null);
  const [infoModal, setInfoModal] = useState<{ title: string; description: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    tone?: "default" | "danger";
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false);
  const [deleteActionBusy, setDeleteActionBusy] = useState<"archive" | "delete" | null>(null);
  const [deleteDataChoiceOpen, setDeleteDataChoiceOpen] = useState(false);
  const [pendingDeleteRequest, setPendingDeleteRequest] = useState<{ id: string; created_at: string; delete_all_data?: boolean | null } | null>(null);
  const [showPerformance, setShowPerformance] = useState(true);
  const [showHandicap, setShowHandicap] = useState(true);
  const [showOpponents, setShowOpponents] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const [savingContact, setSavingContact] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const admin = useAdminStatus();
  const hasAdminPower = admin.isAdmin || admin.isSuper;
  const editDerivedAgeBand = deriveAgeBandFromDob(editDateOfBirth || null);
  const editIsMinor = editDerivedAgeBand !== "18_plus";

  useEffect(() => {
    setQuickDobInput(player?.date_of_birth ?? "");
  }, [player?.date_of_birth]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      setLoading(false);
      return;
    }
    let active = true;
    const run = async () => {
      const [authRes, pRes, allPlayersRes, mRes, cRes, fRes, locRes, usersRes, pendingDeleteRes, lfRes, ltRes, lfrRes] = await Promise.all([
        client.auth.getUser(),
        client
          .from("players")
          .select(
            "id,display_name,full_name,date_of_birth,avatar_url,is_archived,claimed_by,location_id,age_band,guardian_consent,guardian_name,guardian_email,guardian_user_id,rating_snooker,peak_rating_snooker,rated_matches_snooker,snooker_handicap,snooker_handicap_base"
          )
          .eq("id", id)
          .maybeSingle(),
        client
          .from("players")
          .select(
            "id,display_name,full_name,date_of_birth,avatar_url,location_id,age_band,guardian_consent,guardian_user_id,rating_snooker,peak_rating_snooker,rated_matches_snooker,snooker_handicap,snooker_handicap_base"
          )
          .eq("is_archived", false),
        client.from("matches").select("id,competition_id,match_mode,player1_id,player2_id,team1_player1_id,team1_player2_id,team2_player1_id,team2_player2_id,winner_player_id,status,updated_at"),
        client.from("competitions").select("id,sport_type,competition_format"),
        client.from("frames").select("match_id,winner_player_id,is_walkover_award"),
        client.from("locations").select("id,name").order("name"),
        client.from("app_users").select("id,email,linked_player_id"),
        client
          .from("player_deletion_requests")
          .select("id,created_at,delete_all_data")
          .eq("player_id", id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1),
        client.from("league_fixtures").select("id,season_id,fixture_date,week_no,home_team_id,away_team_id,home_points,away_points,status"),
        client.from("league_teams").select("id,name"),
        client
          .from("league_fixture_frames")
          .select("fixture_id,slot_no,slot_type,home_player1_id,home_player2_id,away_player1_id,away_player2_id,winner_side,home_forfeit,away_forfeit,home_points_scored,away_points_scored"),
      ]);
      if (!active) return;
      if (pRes.error || allPlayersRes.error) {
        const detail =
          pRes.error?.message ||
          allPlayersRes.error?.message ||
          "Unknown error";
        setMessage(`Failed to load player profile: ${detail}`);
        setLoading(false);
        return;
      }
      setUserId(authRes.data.user?.id ?? null);
      const loadedPlayer = (pRes.data as Player & { claimed_by?: string | null }) ?? null;
      let loadedPhone: string | null = null;
      let loadedPhoneConsent = false;
      if (loadedPlayer?.id) {
        const phoneRes = await client
          .from("players")
          .select("phone_number,phone_share_consent")
          .eq("id", loadedPlayer.id)
          .maybeSingle();
        if (!phoneRes.error) {
          loadedPhone = (phoneRes.data as { phone_number?: string | null } | null)?.phone_number ?? null;
          loadedPhoneConsent = Boolean(
            (phoneRes.data as { phone_share_consent?: boolean | null } | null)?.phone_share_consent
          );
        }
      }
      setPlayer(
        loadedPlayer
          ? {
              ...loadedPlayer,
              phone_number: loadedPhone,
              phone_share_consent: loadedPhoneConsent,
            }
          : null
      );
      setEditFullName(loadedPlayer?.full_name ?? loadedPlayer?.display_name ?? "");
      setEditDateOfBirth(loadedPlayer?.date_of_birth ?? "");
      setEditLocationId(loadedPlayer?.location_id ?? "");
      setEditPhoneNumber(loadedPhone ?? "");
      setEditPhoneConsent(loadedPhoneConsent);
      setEditGuardianConsent(Boolean(loadedPlayer?.guardian_consent));
      setEditGuardianName(loadedPlayer?.guardian_name ?? "");
      setEditGuardianEmail(loadedPlayer?.guardian_email ?? "");
      setEditGuardianUserId(loadedPlayer?.guardian_user_id ?? "");
      if (loadedPlayer?.claimed_by) {
        const { data: linked } = await client
          .from("app_users")
          .select("email")
          .eq("id", loadedPlayer.claimed_by)
          .maybeSingle();
        setLinkedEmail(linked?.email ?? null);
      } else {
        setLinkedEmail(null);
      }
      setPlayers((allPlayersRes.data ?? []) as Player[]);
      if (!usersRes.error && usersRes.data) setAppUsers(usersRes.data as AppUser[]);
      setMatches((mRes.error ? [] : (mRes.data ?? [])) as MatchRow[]);
      setCompetitions((cRes.error ? [] : (cRes.data ?? [])) as Competition[]);
      setFrames((fRes.error ? [] : (fRes.data ?? [])) as Frame[]);
      setLeagueFixtures((lfRes.error ? [] : (lfRes.data ?? [])) as LeagueFixtureLite[]);
      setLeagueTeams((ltRes.error ? [] : (ltRes.data ?? [])) as LeagueTeamLite[]);
      setLeagueFrames((lfrRes.error ? [] : (lfrRes.data ?? [])) as LeagueFrameLite[]);
      const handicapRes = await client
        .from("league_handicap_history")
        .select("id,player_id,fixture_id,season_id,change_type,delta,previous_handicap,new_handicap,reason,created_at")
        .eq("player_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!handicapRes.error) {
        setHandicapHistory((handicapRes.data ?? []) as HandicapHistoryEntry[]);
      } else if (!handicapRes.error.message.toLowerCase().includes("league_handicap_history")) {
        setMessage(`Failed to load handicap history: ${handicapRes.error.message}`);
      }
      if (!locRes.error && locRes.data) {
        setLocations(locRes.data as Location[]);
      }
      setPendingDeleteRequest(pendingDeleteRes.data?.[0] ?? null);
      setLoading(false);
    };
    run();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("prompt") !== "photo") return;
    setInfoModal({
      title: "Complete your profile",
      description: "You can now review your profile details and optionally upload a profile picture.",
    });
    params.delete("prompt");
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", next);
  }, []);

  const onEditFullName = async () => {
    const client = supabase;
    if (!client || !player) return;
    const proposed = window.prompt(`Enter first and second name for ${player.display_name}`, player.full_name ?? "");
    if (!proposed) return;
    const cleaned = proposed.trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (deriveAgeBandFromDob(player.date_of_birth ?? null) !== "18_plus") {
      if (parts.length !== 1) {
        setMessage("Minors must use first name or nickname only.");
        return;
      }
    } else if (parts.length < 2) {
      setMessage("Name must include first and second name.");
      return;
    }
    setSavingName(true);
    const updatePayload =
      deriveAgeBandFromDob(player.date_of_birth ?? null) !== "18_plus"
        ? { full_name: parts[0], display_name: parts[0] }
        : { full_name: cleaned };
    const { error } = await client.from("players").update(updatePayload).eq("id", player.id);
    setSavingName(false);
    if (error) {
      setMessage(`Failed to update full name: ${error.message}`);
      return;
    }
    setPlayer((prev) => (prev ? { ...prev, full_name: updatePayload.full_name ?? cleaned, display_name: updatePayload.display_name ?? prev.display_name } : prev));
    setMessage("Name updated.");
  };

  const onUploadAvatar = async (file: File) => {
    const client = supabase;
    if (!client || !player) return;
    if (deriveAgeBandFromDob(player.date_of_birth ?? null) !== "18_plus") {
      setMessage("Profile photos are disabled for minors.");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `avatars/${player.id}-${Date.now()}.${ext}`;
    const uploadRes = await client.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadRes.error) {
      setUploading(false);
      setMessage(`Avatar upload failed: ${uploadRes.error.message}`);
      return;
    }
    const publicUrl = client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    if (!hasAdminPower) {
      const { error } = await client.from("player_update_requests").insert({
        player_id: player.id,
        requester_user_id: userId,
        requested_full_name: null,
        requested_location_id: null,
        requested_avatar_url: publicUrl,
        status: "pending",
      });
      setUploading(false);
      if (error) {
        setMessage(`Failed to submit avatar update: ${error.message}`);
        return;
      }
      setMessage(null);
      setInfoModal({
        title: "Profile photo submitted",
        description: "Your profile photo has been sent for administrator approval.",
      });
      return;
    }
    const { error } = await client.from("players").update({ avatar_url: publicUrl }).eq("id", player.id);
    setUploading(false);
    if (error) {
      setMessage(`Failed to save avatar: ${error.message}`);
      return;
    }
    setPlayer((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
    setMessage(null);
    setInfoModal({
      title: "Profile photo updated",
      description: "Your new profile photo has been saved.",
    });
    profileRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onArchiveToggle = async () => {
    const client = supabase;
    if (!client || !player || !admin.isSuper) return;
    const nextArchived = !Boolean(player.is_archived);
    const { error } = await client.from("players").update({ is_archived: nextArchived }).eq("id", player.id);
    if (error) {
      setMessage(`Failed to update archive status: ${error.message}`);
      return;
    }
    setPlayer((prev) => (prev ? { ...prev, is_archived: nextArchived } : prev));
    setMessage(nextArchived ? "Player archived." : "Player restored.");
  };

  const onSavePlayerEdits = async () => {
    const client = supabase;
    if (!client || !player || !admin.isSuper) return;
    const trimmedName = editFullName.trim();
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    const computedAgeBand = deriveAgeBandFromDob(editDateOfBirth || null);
    const isMinorBand = computedAgeBand !== "18_plus";
    if (!editDateOfBirth) {
      setInfoModal({ title: "Date of Birth Required", description: "Date of birth is required." });
      setMessage("Date of birth is required.");
      return;
    }
    if (isMinorBand) {
      if (!trimmedName || parts.length !== 1) {
        setInfoModal({ title: "Invalid Name", description: "For minors, use first name or nickname only." });
        setMessage("For minors, use first name or nickname only.");
        return;
      }
      if (!editLocationId) {
        setInfoModal({ title: "Location Required", description: "Location is required for under-18 profiles." });
        setMessage("Location is required for under-18 profiles.");
        return;
      }
      if (!editGuardianName.trim()) {
        setInfoModal({ title: "Guardian Required", description: "Guardian name is required for minors." });
        setMessage("Guardian name is required for minors.");
        return;
      }
      if (!editGuardianEmail.trim()) {
        setInfoModal({ title: "Guardian Required", description: "Guardian email is required for minors." });
        setMessage("Guardian email is required for minors.");
        return;
      }
      if (!editGuardianUserId) {
        setInfoModal({ title: "Guardian Required", description: "Guardian account must be linked for minors." });
        setMessage("Guardian account must be linked for minors.");
        return;
      }
    } else {
      if (!trimmedName || parts.length < 2) {
        setInfoModal({ title: "Invalid Name", description: "Adults must include first and second name." });
        setMessage("Adults must include first and second name.");
        return;
      }
      if (!editLocationId) {
        setInfoModal({ title: "Location Required", description: "Location is required for adults." });
        setMessage("Location is required for adults.");
        return;
      }
    }
    setSavingPlayer(true);
    const payload: Record<string, unknown> = {
      full_name: trimmedName,
      display_name: parts[0] ?? trimmedName,
      date_of_birth: editDateOfBirth || null,
      age_band: computedAgeBand,
      location_id: editLocationId || null,
      phone_number: editPhoneNumber.trim() || null,
      phone_share_consent: Boolean(editPhoneConsent),
      guardian_consent: isMinorBand ? editGuardianConsent : false,
      guardian_name: isMinorBand ? editGuardianName.trim() || null : null,
      guardian_email: isMinorBand ? (editGuardianEmail.trim() || null) : null,
      guardian_user_id: isMinorBand ? editGuardianUserId || null : null,
    };
    const { error } = await client.from("players").update(payload).eq("id", player.id);
    setSavingPlayer(false);
    if (error) {
      if (error.message.includes("players_display_name_lower_uniq")) {
        setMessage(null);
        setInfoModal({
          title: "Name already in use",
          description: "A player profile with this display name already exists. Please choose a different first name/nickname.",
        });
        return;
      }
      setMessage(`Failed to save player: ${error.message}`);
      return;
    }
    setPlayer((prev) =>
      prev
        ? {
            ...prev,
            full_name: payload.full_name as string,
            display_name: payload.display_name as string,
            date_of_birth: (payload.date_of_birth as string | null) ?? null,
            age_band: payload.age_band as string,
            location_id: (payload.location_id as string | null) ?? null,
            phone_number: (payload.phone_number as string | null) ?? null,
            phone_share_consent: Boolean(payload.phone_share_consent),
            guardian_consent: Boolean(payload.guardian_consent),
            guardian_name: (payload.guardian_name as string | null) ?? null,
            guardian_email: (payload.guardian_email as string | null) ?? null,
            guardian_user_id: (payload.guardian_user_id as string | null) ?? null,
          }
        : prev
    );
    setEditingPlayer(false);
    setMessage("Player profile updated.");
  };

  const onSaveDobQuick = async () => {
    const client = supabase;
    if (!client || !player || !admin.isSuper) return;
    if (!quickDobInput.trim()) {
      setInfoModal({ title: "Date of Birth Required", description: "Enter a date of birth before saving." });
      return;
    }
    const computedAgeBand = deriveAgeBandFromDob(quickDobInput || null);
    setSavingQuickDob(true);
    const payload: Record<string, string | null> = {
      date_of_birth: quickDobInput,
      age_band: computedAgeBand,
    };
    if (computedAgeBand !== "18_plus") {
      payload.avatar_url = null;
    }
    const { error } = await client.from("players").update(payload).eq("id", player.id);
    setSavingQuickDob(false);
    if (error) {
      setMessage(`Failed to update date of birth: ${error.message}`);
      return;
    }
    setPlayer((prev) =>
      prev
        ? {
            ...prev,
            date_of_birth: quickDobInput,
            age_band: computedAgeBand,
            avatar_url: computedAgeBand !== "18_plus" ? null : prev.avatar_url,
          }
        : prev
    );
    setEditDateOfBirth(quickDobInput);
    setMessage(null);
    setInfoModal({
      title: "Date of Birth Updated",
      description: "Player date of birth has been saved.",
    });
  };

  const onSaveOwnContact = async () => {
    const client = supabase;
    if (!client || !player || !canEditOwnContact) return;
    const { data: sessionRes } = await client.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
    }
    setSavingContact(true);
    const resp = await fetch("/api/player/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        playerId: player.id,
        phoneNumber: editPhoneNumber.trim() || null,
        phoneShareConsent: Boolean(editPhoneConsent),
      }),
    });
    setSavingContact(false);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      setMessage(data?.error ?? "Failed to save contact settings.");
      return;
    }
    setPlayer((prev) =>
      prev
        ? {
            ...prev,
            phone_number: editPhoneNumber.trim() || null,
            phone_share_consent: Boolean(editPhoneConsent),
          }
        : prev
    );
    setInfoModal({
      title: "Contact preferences updated",
      description: "Your phone sharing preference has been saved.",
    });
  };

  const playerHasMatchHistory = async (playerId: string) => {
    const client = supabase;
    if (!client) return null;
    const { count, error } = await client
      .from("matches")
      .select("id", { count: "exact", head: true })
      .or(
        [
          `player1_id.eq.${playerId}`,
          `player2_id.eq.${playerId}`,
          `team1_player1_id.eq.${playerId}`,
          `team1_player2_id.eq.${playerId}`,
          `team2_player1_id.eq.${playerId}`,
          `team2_player2_id.eq.${playerId}`,
          `winner_player_id.eq.${playerId}`,
          `opening_break_player_id.eq.${playerId}`,
        ].join(",")
      );
    if (error) return null;
    return (count ?? 0) > 0;
  };

  const onDeletePlayerNow = async () => {
    const client = supabase;
    if (!client || !player || !admin.isSuper) return;
    setDeleteActionBusy("delete");

    const ownerLinked = await client
      .from("app_users")
      .select("id")
      .eq("linked_player_id", player.id)
      .eq("role", "owner")
      .maybeSingle();
    if (ownerLinked.data?.id) {
      setDeleteActionBusy(null);
      setDeleteChoiceOpen(false);
      setInfoModal({
        title: "Cannot Delete",
        description: "This profile is linked to the Super User account and cannot be deleted.",
      });
      return;
    }

    const hasHistory = await playerHasMatchHistory(player.id);
    if (hasHistory === null) {
      setDeleteActionBusy(null);
      setDeleteChoiceOpen(false);
      setInfoModal({
        title: "Delete unavailable",
        description: "Could not verify player match history. Please try again.",
      });
      return;
    }
    if (hasHistory) {
      setDeleteActionBusy(null);
      setDeleteChoiceOpen(false);
      setInfoModal({
        title: "Cannot delete permanently",
        description: "This profile has match history. Use Archive profile to preserve stats.",
      });
      return;
    }

    const unlinkRes = await client.from("app_users").update({ linked_player_id: null }).eq("linked_player_id", player.id);
    if (unlinkRes.error) {
      setDeleteActionBusy(null);
      setMessage(`Failed to unlink account: ${unlinkRes.error.message}`);
      return;
    }
    const delRes = await client.from("players").delete().eq("id", player.id).select("id").maybeSingle();
    if (delRes.error) {
      setDeleteActionBusy(null);
      setMessage(`Failed to delete player: ${delRes.error.message}`);
      return;
    }
    if (!delRes.data) {
      setDeleteActionBusy(null);
      setMessage("Failed to delete player: no profile was deleted.");
      return;
    }
    setDeleteActionBusy(null);
    setDeleteChoiceOpen(false);
    setInfoModal({ title: "Profile Deleted", description: "Player profile deleted permanently." });
    setTimeout(() => {
      if (typeof window !== "undefined") window.location.href = "/players";
    }, 250);
  };

  const onArchivePlayerNow = async () => {
    const client = supabase;
    if (!client || !player || !admin.isSuper) return;
    setDeleteActionBusy("archive");
    const { data, error } = await client
      .from("players")
      .update({ is_archived: true })
      .eq("id", player.id)
      .select("id")
      .maybeSingle();
    if (error) {
      setDeleteActionBusy(null);
      setMessage(`Failed to archive player: ${error.message}`);
      return;
    }
    if (!data) {
      setDeleteActionBusy(null);
      setMessage("Failed to archive player: no profile was updated.");
      return;
    }
    setPlayer((prev) => (prev ? { ...prev, is_archived: true } : prev));
    setDeleteActionBusy(null);
    setDeleteChoiceOpen(false);
    setInfoModal({
      title: "Profile Archived",
      description: "Player profile archived successfully.",
    });
  };

  const onRequestDeleteProfile = async (deleteAllData: boolean) => {
    const client = supabase;
    if (!client || !player || !userId) return;
    if (pendingDeleteRequest) {
      setInfoModal({
        title: "Request Already Pending",
        description: `A deletion request is already pending (${new Date(pendingDeleteRequest.created_at).toLocaleString()}).`,
      });
      return;
    }
    const { data: reqData, error } = await client
      .from("player_deletion_requests")
      .insert({
        player_id: player.id,
        requester_user_id: userId,
        delete_all_data: deleteAllData,
        status: "pending",
      })
      .select("id,created_at,delete_all_data")
      .single();
    if (error) {
      setMessage(null);
      setInfoModal({
        title: "Unable to submit request",
        description: error.message,
      });
      return;
    }
    setPendingDeleteRequest((reqData as { id: string; created_at: string; delete_all_data?: boolean | null }) ?? null);
    setInfoModal({
      title: "Deletion Request Submitted",
      description: deleteAllData
        ? "Your profile deletion request has been sent to the Super User for review, with personal-data deletion requested."
        : "Your profile deletion request has been sent to the Super User for review.",
    });
  };

  const playerName = player?.full_name?.trim() ? player.full_name : player?.display_name ?? "Player";
  const playerAge = calculateAge(player?.date_of_birth ?? null);
  const playerDerivedAgeBand = deriveAgeBandFromDob(player?.date_of_birth ?? null);
  const compMap = useMemo(() => new Map(competitions.map((c) => [c.id, c])), [competitions]);
  const nameMap = useMemo(
    () => new Map(players.map((p) => [p.id, p.full_name?.trim() ? p.full_name : p.display_name])),
    [players]
  );
  const framesByMatch = useMemo(() => {
    const map = new Map<string, Frame[]>();
    for (const f of frames) {
      const prev = map.get(f.match_id) ?? [];
      prev.push(f);
      map.set(f.match_id, prev);
    }
    return map;
  }, [frames]);
  const isMinor = playerDerivedAgeBand !== "18_plus";
  const appUserById = useMemo(() => new Map(appUsers.map((u) => [u.id, u])), [appUsers]);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const guardianUser = player?.guardian_user_id ? appUserById.get(player.guardian_user_id) : null;
  const guardianLinkedPlayer = guardianUser?.linked_player_id ? playerById.get(guardianUser.linked_player_id) : null;
  const guardianProfileId = guardianLinkedPlayer?.id ?? null;
  const guardianLabel =
    guardianLinkedPlayer?.full_name?.trim() || guardianLinkedPlayer?.display_name || player?.guardian_name || null;
  const guardianContact = player?.guardian_email?.trim() || guardianUser?.email || null;
  const currentProfileLinkedUserId = useMemo(() => {
    if (!player?.id) return null;
    if (player.claimed_by) return player.claimed_by;
    const linkedUser = appUsers.find((u) => u.linked_player_id === player.id);
    return linkedUser?.id ?? null;
  }, [appUsers, player?.claimed_by, player?.id]);
  const childProfiles = useMemo(() => {
    if (!currentProfileLinkedUserId) return [] as Player[];
    return players.filter((p) => p.guardian_user_id === currentProfileLinkedUserId);
  }, [players, currentProfileLinkedUserId]);
  const canEditOwnContact = Boolean(userId && (player?.claimed_by === userId || currentProfileLinkedUserId === userId));
  const visiblePhone = admin.isSuper
    ? player?.phone_number?.trim() || null
    : player?.phone_share_consent
      ? player?.phone_number?.trim() || null
      : null;
  const rankingCard = useMemo(() => {
    if (!player) return null;
    const bySnooker = [...players].sort((a, b) => (b.rating_snooker ?? 1000) - (a.rating_snooker ?? 1000));
    const snookerRank = Math.max(1, bySnooker.findIndex((p) => p.id === player.id) + 1);
    return {
      snookerRank,
      snookerRating: player.rating_snooker ?? 1000,
      snookerPeak: player.peak_rating_snooker ?? 1000,
      snookerMatches: player.rated_matches_snooker ?? 0,
      totalPlayers: players.length,
    };
  }, [player, players]);
  const eloLeaderboard = useMemo(
    () =>
      [...players]
        .sort((a, b) => {
          const ratingDiff = Number(b.rating_snooker ?? 1000) - Number(a.rating_snooker ?? 1000);
          if (ratingDiff !== 0) return ratingDiff;
          return displayPlayerName(a).localeCompare(displayPlayerName(b));
        })
        .map((p, index) => ({
          id: p.id,
          rank: index + 1,
          name: displayPlayerName(p),
          rating: Math.round(Number(p.rating_snooker ?? 1000)),
          handicap: Number(p.snooker_handicap ?? 0),
        })),
    [players]
  );
  const handicapExplain = useMemo(() => {
    const current = Number(player?.snooker_handicap ?? 0);
    if (current < 0) return `Current match start: this player gives ${Math.abs(current)} points start to a scratch (0) opponent.`;
    if (current > 0) return `Current match start: this player receives ${current} points start from a scratch (0) opponent.`;
    return "Current match start: this player is off scratch and neither gives nor receives points against a 0-handicap opponent.";
  }, [player?.snooker_handicap]);
  const baselineExplain = useMemo(() => {
    const start = Number(player?.snooker_handicap_base ?? 0);
    if (start < 0) return `Starting handicap for this season/review cycle: gives ${Math.abs(start)} start.`;
    if (start > 0) return `Starting handicap for this season/review cycle: receives ${start} start.`;
    return "Starting handicap for this season/review cycle: scratch.";
  }, [player?.snooker_handicap_base]);
  const isWalkoverMatch = (m: MatchRow) => {
    const rows = framesByMatch.get(m.id) ?? [];
    return rows.length > 0 && rows.every((f) => f.is_walkover_award);
  };
  const leagueFixtureById = useMemo(() => new Map(leagueFixtures.map((f) => [f.id, f])), [leagueFixtures]);
  const leagueTeamById = useMemo(() => new Map(leagueTeams.map((t) => [t.id, t.name])), [leagueTeams]);
  const leagueRelevant = useMemo(
    () =>
      leagueFrames.filter((s) => {
        const inHome = s.home_player1_id === id || s.home_player2_id === id;
        const inAway = s.away_player1_id === id || s.away_player2_id === id;
        if (!inHome && !inAway) return false;
        const noShowBoth = s.home_forfeit && s.away_forfeit;
        if (noShowBoth) return false;
        return s.winner_side !== null;
      }),
    [leagueFrames, id]
  );
  const relevant = useMemo(
    () =>
      matches.filter((m) => {
        if (m.status !== "complete") return false;
        if (isWalkoverMatch(m)) return false;
        if (m.match_mode === "singles") return m.player1_id === id || m.player2_id === id;
        return m.team1_player1_id === id || m.team1_player2_id === id || m.team2_player1_id === id || m.team2_player2_id === id;
      }),
    [matches, id, framesByMatch]
  );

  const summary = useMemo(() => {
    let played = 0;
    let won = 0;
    let lost = 0;
    let framesFor = 0;
    let framesAgainst = 0;
    let snookerPlayed = 0;
    let snookerWon = 0;

    for (const m of relevant) {
      played += 1;
      const c = compMap.get(m.competition_id);
      const inTeam1 = m.team1_player1_id === id || m.team1_player2_id === id;
      const winnerIsTeam1 = m.winner_player_id === m.team1_player1_id || m.winner_player_id === m.team1_player2_id;
      const winnerIsTeam2 = m.winner_player_id === m.team2_player1_id || m.winner_player_id === m.team2_player2_id;
      const isWin = m.match_mode === "singles" ? m.winner_player_id === id : inTeam1 ? winnerIsTeam1 : winnerIsTeam2;
      if (isWin) won += 1;
      else lost += 1;
      if (c?.sport_type === "snooker") {
        snookerPlayed += 1;
        if (isWin) snookerWon += 1;
      }

      const ff = frames.filter((f) => f.match_id === m.id && !f.is_walkover_award);
      for (const f of ff) {
        if (m.match_mode === "singles") {
          if (f.winner_player_id === id) framesFor += 1;
          else framesAgainst += 1;
        } else {
          const frameTeam1 = f.winner_player_id === m.team1_player1_id || f.winner_player_id === m.team1_player2_id;
          const frameTeam2 = f.winner_player_id === m.team2_player1_id || f.winner_player_id === m.team2_player2_id;
          if ((inTeam1 && frameTeam1) || (!inTeam1 && frameTeam2)) framesFor += 1;
          if ((inTeam1 && frameTeam2) || (!inTeam1 && frameTeam1)) framesAgainst += 1;
        }
      }
    }

    return { played, won, lost, framesFor, framesAgainst, snookerPlayed, snookerWon };
  }, [relevant, compMap, frames, id]);
  const leagueSummary = useMemo(() => {
    let played = 0;
    let won = 0;
    let lost = 0;
    for (const s of leagueRelevant) {
      const inHome = s.home_player1_id === id || s.home_player2_id === id;
      played += 1;
      if ((inHome && s.winner_side === "home") || (!inHome && s.winner_side === "away")) won += 1;
      else lost += 1;
    }
    return {
      played,
      won,
      lost,
      framesFor: won,
      framesAgainst: lost,
      snookerPlayed: played,
      snookerWon: won,
    };
  }, [leagueRelevant, id]);
  const effectiveSummary = summary.played > 0 ? summary : leagueSummary;

  const formGuide = useMemo(() => {
    const chars: string[] = [];
    const sorted = [...relevant].sort((a, b) => Date.parse(b.updated_at ?? "0") - Date.parse(a.updated_at ?? "0"));
    for (const m of sorted) {
      const ff = frames.filter((f) => f.match_id === m.id && !f.is_walkover_award);
      if (ff.length) {
        for (const f of ff) {
          if (m.match_mode === "singles") chars.push(f.winner_player_id === id ? "W" : "L");
          else {
            const inTeam1 = m.team1_player1_id === id || m.team1_player2_id === id;
            const frameTeam1 = f.winner_player_id === m.team1_player1_id || f.winner_player_id === m.team1_player2_id;
            const frameTeam2 = f.winner_player_id === m.team2_player1_id || f.winner_player_id === m.team2_player2_id;
            chars.push((inTeam1 ? frameTeam1 : frameTeam2) ? "W" : "L");
          }
          if (chars.length >= 10) return chars.join("");
        }
      } else {
        const inTeam1 = m.team1_player1_id === id || m.team1_player2_id === id;
        const winnerIsTeam1 = m.winner_player_id === m.team1_player1_id || m.winner_player_id === m.team1_player2_id;
        chars.push(m.match_mode === "singles" ? (m.winner_player_id === id ? "W" : "L") : (inTeam1 ? winnerIsTeam1 : !winnerIsTeam1) ? "W" : "L");
        if (chars.length >= 10) return chars.join("");
      }
    }
    return chars.length ? chars.join("") : "-";
  }, [relevant, frames, id]);
  const leagueFormGuide = useMemo(() => {
    const chars: string[] = [];
    const sorted = [...leagueRelevant].sort((a, b) => {
      const da = Date.parse(leagueFixtureById.get(a.fixture_id)?.fixture_date ?? "0");
      const db = Date.parse(leagueFixtureById.get(b.fixture_id)?.fixture_date ?? "0");
      return db - da;
    });
    for (const s of sorted) {
      const inHome = s.home_player1_id === id || s.home_player2_id === id;
      chars.push((inHome && s.winner_side === "home") || (!inHome && s.winner_side === "away") ? "W" : "L");
      if (chars.length >= 10) break;
    }
    return chars.length ? chars.join("") : "-";
  }, [leagueRelevant, leagueFixtureById, id]);
  const effectiveFormGuide = formGuide !== "-" ? formGuide : leagueFormGuide;

  const opponents = useMemo(() => {
    const map = new Map<string, { played: number; won: number; lost: number }>();
    for (const m of relevant) {
      if (m.match_mode !== "singles") continue;
      const oppId = m.player1_id === id ? m.player2_id : m.player1_id;
      if (!oppId) continue;
      const row = map.get(oppId) ?? { played: 0, won: 0, lost: 0 };
      row.played += 1;
      if (m.winner_player_id === id) row.won += 1;
      else row.lost += 1;
      map.set(oppId, row);
    }
    return [...map.entries()]
      .map(([oppId, s]) => ({ opponentId: oppId, opponent: nameMap.get(oppId) ?? "Unknown", ...s }))
      .sort((a, b) => b.played - a.played || a.opponent.localeCompare(b.opponent));
  }, [relevant, id, nameMap]);
  const leagueOpponents = useMemo(() => {
    const map = new Map<string, { played: number; won: number; lost: number }>();
    for (const s of leagueRelevant) {
      if (s.slot_type !== "singles") continue;
      const inHome = s.home_player1_id === id || s.home_player2_id === id;
      const oppId = inHome ? s.away_player1_id : s.home_player1_id;
      if (!oppId) continue;
      const row = map.get(oppId) ?? { played: 0, won: 0, lost: 0 };
      row.played += 1;
      const isWin = (inHome && s.winner_side === "home") || (!inHome && s.winner_side === "away");
      if (isWin) row.won += 1;
      else row.lost += 1;
      map.set(oppId, row);
    }
    return [...map.entries()]
      .map(([oppId, s]) => ({ opponentId: oppId, opponent: nameMap.get(oppId) ?? "Unknown", ...s }))
      .sort((a, b) => b.played - a.played || a.opponent.localeCompare(b.opponent));
  }, [leagueRelevant, id, nameMap]);
  const effectiveOpponents = opponents.length > 0 ? opponents : leagueOpponents;
  const leagueHistory = useMemo(() => {
    const byFixture = new Map<
      string,
      {
        fixtureId: string;
        date: string | null;
        label: string;
        wonFrames: number;
        lostFrames: number;
      }
    >();
    for (const s of leagueRelevant) {
      const fixture = leagueFixtureById.get(s.fixture_id);
      if (!fixture) continue;
      const homeTeam = leagueTeamById.get(fixture.home_team_id) ?? "Home";
      const awayTeam = leagueTeamById.get(fixture.away_team_id) ?? "Away";
      const inHome = s.home_player1_id === id || s.home_player2_id === id;
      const isWin = (inHome && s.winner_side === "home") || (!inHome && s.winner_side === "away");
      const row = byFixture.get(s.fixture_id) ?? {
        fixtureId: s.fixture_id,
        date: fixture.fixture_date,
        label: `Week ${fixture.week_no ?? "?"} · ${homeTeam} vs ${awayTeam}`,
        wonFrames: 0,
        lostFrames: 0,
      };
      if (isWin) row.wonFrames += 1;
      else row.lostFrames += 1;
      byFixture.set(s.fixture_id, row);
    }
    return Array.from(byFixture.values())
      .map((r) => ({
        key: r.fixtureId,
        fixtureId: r.fixtureId,
        date: r.date,
        label: r.label,
        result: r.wonFrames >= r.lostFrames ? "W" as const : "L" as const,
      }))
      .sort((a, b) => Date.parse(b.date ?? "0") - Date.parse(a.date ?? "0"))
      .slice(0, 20);
  }, [leagueRelevant, leagueFixtureById, leagueTeamById, id]);
  const opponentFrameDetails = useMemo(() => {
    if (!opponentDetail) return [];
    return leagueRelevant
      .filter((s) => {
        if (s.slot_type !== "singles") return false;
        const inHome = s.home_player1_id === id || s.home_player2_id === id;
        const oppId = inHome ? s.away_player1_id : s.home_player1_id;
        return oppId === opponentDetail.opponentId;
      })
      .map((s) => {
        const fixture = leagueFixtureById.get(s.fixture_id);
        const inHome = s.home_player1_id === id || s.home_player2_id === id;
        const isWin = (inHome && s.winner_side === "home") || (!inHome && s.winner_side === "away");
        const myPts = inHome ? s.home_points_scored ?? null : s.away_points_scored ?? null;
        const oppPts = inHome ? s.away_points_scored ?? null : s.home_points_scored ?? null;
        return {
          key: `${s.fixture_id}-${s.slot_no}`,
          date: fixture?.fixture_date ?? null,
          frameLabel: `${s.slot_type === "doubles" ? "Doubles" : "Singles"} ${s.slot_no}`,
          scoreLabel: myPts !== null && oppPts !== null ? `${myPts}-${oppPts}` : "Score not recorded",
          result: isWin ? "W" : "L",
        };
      })
      .sort((a, b) => Date.parse(b.date ?? "0") - Date.parse(a.date ?? "0"));
  }, [opponentDetail, leagueRelevant, leagueFixtureById, leagueTeamById, id]);
  const historyFrameDetails = useMemo(() => {
    if (!historyDetail) return [];
    const selectedFixture = leagueFixtureById.get(historyDetail.fixtureId) ?? null;
    return leagueFrames
      .filter((s) => {
        if (s.fixture_id !== historyDetail.fixtureId) return false;
        return s.home_player1_id === id || s.home_player2_id === id || s.away_player1_id === id || s.away_player2_id === id;
      })
      .sort((a, b) => a.slot_no - b.slot_no)
      .map((s) => {
        const inHome = s.home_player1_id === id || s.home_player2_id === id;
        const isMyFrame = inHome || s.away_player1_id === id || s.away_player2_id === id;
        const myResult = !isMyFrame ? "-" : (inHome ? (s.winner_side === "home" ? "W" : s.winner_side === "away" ? "L" : "-") : (s.winner_side === "away" ? "W" : s.winner_side === "home" ? "L" : "-"));
        const myPts = inHome ? s.home_points_scored ?? null : s.away_points_scored ?? null;
        const oppPts = inHome ? s.away_points_scored ?? null : s.home_points_scored ?? null;
        const opponentName =
          s.slot_type === "singles"
            ? (inHome ? (s.away_player1_id ? (nameMap.get(s.away_player1_id) ?? "Opponent") : "Opponent") : (s.home_player1_id ? (nameMap.get(s.home_player1_id) ?? "Opponent") : "Opponent"))
            : "Doubles";
        return {
          key: `${s.fixture_id}-${s.slot_no}-${s.slot_type}`,
          slotLabel: `${s.slot_type === "doubles" ? "Doubles" : "Singles"} ${s.slot_no}`,
          opponentName,
          scoreLabel: myPts !== null && oppPts !== null ? `${myPts}-${oppPts}` : "Score not recorded",
          myResult,
        };
      });
  }, [historyDetail, leagueFixtureById, leagueFrames, nameMap, id]);
  const historyMatchSummary = useMemo(() => {
    if (!historyDetail) return null;
    const fixture = leagueFixtureById.get(historyDetail.fixtureId);
    if (!fixture) return null;
    const homeTeam = leagueTeamById.get(fixture.home_team_id) ?? "Home";
    const awayTeam = leagueTeamById.get(fixture.away_team_id) ?? "Away";
    const homePts = fixture.home_points ?? 0;
    const awayPts = fixture.away_points ?? 0;
    return {
      line: `${homeTeam} ${homePts} - ${awayPts} ${awayTeam}`,
      date: fixture.fixture_date,
    };
  }, [historyDetail, leagueFixtureById, leagueTeamById]);
  const historyPlayerContribution = useMemo(() => {
    const won = historyFrameDetails.filter((r) => r.myResult === "W").length;
    const lost = historyFrameDetails.filter((r) => r.myResult === "L").length;
    const played = won + lost;
    return { played, won, lost };
  }, [historyFrameDetails]);

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <RequireAuth>
          <ScreenHeader
            title={`Player Profile: ${playerName}`}
            eyebrow="Players"
            subtitle="Profile details and individual performance."
          />
          {loading ? <p className="rounded-xl border border-slate-200 bg-white p-4">Loading profile...</p> : null}
          <MessageModal message={message} onClose={() => setMessage(null)} />
          {pendingDeleteRequest ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              Profile deletion request pending Super User approval (submitted {new Date(pendingDeleteRequest.created_at).toLocaleString()}).
            </p>
          ) : null}

          {!loading ? (
            <>
              {player ? (
                <section ref={profileRef} className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-50 to-sky-50 p-4 shadow-sm">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="h-20 w-20 overflow-hidden rounded-full border border-cyan-200 bg-slate-100">
                      {player.avatar_url ? (
                        <img src={player.avatar_url} alt={playerName} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-[220px] flex-1">
                      <p className="text-lg font-semibold text-slate-900">{playerName}</p>
                      {linkedEmail ? <p className="text-sm text-slate-600">{linkedEmail}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700">
                          Age: <span className="font-semibold text-slate-900">{playerAge ?? "Not set"}</span>
                        </span>
                        <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700">
                          Handicap: <span className="font-semibold text-slate-900">{(player?.snooker_handicap ?? 0) > 0 ? `+${player?.snooker_handicap}` : (player?.snooker_handicap ?? 0)}</span>
                        </span>
                        <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700">
                          Start: <span className="font-semibold text-slate-900">{(player?.snooker_handicap_base ?? 0) > 0 ? `+${player?.snooker_handicap_base}` : (player?.snooker_handicap_base ?? 0)}</span>
                        </span>
                        <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700">
                          Location: <span className="font-semibold text-slate-900">{player?.location_id ? locations.find((l) => l.id === player.location_id)?.name ?? "Assigned" : "Not set"}</span>
                        </span>
                        {isMinor ? (
                          <span className={`rounded-full border px-2 py-0.5 ${player.guardian_consent ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
                            {player.guardian_consent ? "Guardian consent on file" : "Guardian consent pending"}
                          </span>
                        ) : null}
                      </div>
                      {(guardianLabel || guardianContact) ? (
                        <p className="mt-2 text-sm text-slate-600">
                          Guardian: {guardianLabel ?? "Name missing"}
                          {hasAdminPower ? ` · ${guardianContact ?? "Email missing"}` : ""}
                          {guardianProfileId ? (
                            <>
                              {" "}
                              ·{" "}
                              <Link href={`/players/${guardianProfileId}`} className="font-medium text-teal-700 underline">
                                View profile
                              </Link>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                      {visiblePhone ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Contact number: <span className="font-semibold text-slate-900">{visiblePhone}</span>
                          {player?.phone_share_consent ? " · Shared for match scheduling" : ""}
                        </p>
                      ) : null}
                      {admin.isSuper ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Date of birth: {player?.date_of_birth ? new Date(`${player.date_of_birth}T12:00:00`).toLocaleDateString() : "Not set"}
                        </p>
                      ) : null}
                      {!isMinor ? (
                        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) onUploadAvatar(file);
                            }}
                            disabled={uploading}
                          />
                          <span className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700">
                            {uploading ? "Uploading..." : "Upload profile photo"}
                          </span>
                        </label>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">Profile photos are disabled for minors.</p>
                      )}
                      {childProfiles.length > 0 ? (
                        <div className="mt-3 text-sm text-slate-600">
                          <p>Linked child profiles:</p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {childProfiles.map((c) => (
                              <Link
                                key={c.id}
                                href={`/players/${c.id}`}
                                className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-teal-700 underline"
                              >
                                {c.full_name?.trim() ? c.full_name : c.display_name}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}
              {rankingCard ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">Ranking Card</h2>
                    <button
                      type="button"
                      onClick={() => window.open(`/display/ranking/${id}`, "_blank", "noopener,noreferrer,width=900,height=600")}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Pop-out Card
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">Current ratings and rank positions across all active players.</p>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <p className="font-semibold text-slate-900">How ranking is calculated</p>
                    <p className="mt-1">
                      Ratings use an Elo-style model. Every player has a live snooker rating. Before a frame starts, the system works out the expected result from both players&apos; current ratings. After an approved result, ratings move up or down.
                    </p>
                    <p className="mt-1">
                      If a higher-rated player beats a lower-rated player, the change is usually small because that result was expected. If a lower-rated player causes an upset, the change is larger. K-factor is higher for newer players and lower for experienced players, so new ratings settle faster than established ones.
                    </p>
                    <p className="mt-1">
                      Example 1: a 1080-rated player beats a 980-rated player. That is close to the expected result, so the winner may only gain a few points and the loser may only drop a few points.
                    </p>
                    <p className="mt-1">
                      Example 2: a 980-rated player beats a 1080-rated player. That is an upset, so the 980-rated player gains more points and the 1080-rated player loses more points.
                    </p>
                    <p className="mt-1">
                      Example 3: if two players are rated very closely, the result usually produces a balanced change in both directions because the frame was considered close to a 50/50 match.
                    </p>
                    <p className="mt-1">
                      BYE, walkover, no-show, nominated-player, and void outcomes are excluded from ratings.
                    </p>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-1">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">Snooker Rating</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{Math.round(rankingCard.snookerRating)}</p>
                      <p className="text-sm text-slate-600">Rank #{rankingCard.snookerRank} of {rankingCard.totalPlayers}</p>
                      <p className="text-xs text-slate-500">Peak {Math.round(rankingCard.snookerPeak)} · Rated matches {rankingCard.snookerMatches}</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">Live Elo and Handicap Table</p>
                      <p className="text-xs text-slate-500">All active players</p>
                    </div>
                    <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-200">
                      <table className="min-w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                            <th className="px-3 py-2">#</th>
                            <th className="px-3 py-2">Player</th>
                            <th className="px-3 py-2">Elo</th>
                            <th className="px-3 py-2">Handicap</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eloLeaderboard.map((row) => (
                            <tr
                              key={row.id}
                              className={`border-b border-slate-100 text-slate-800 last:border-b-0 ${row.id === player.id ? "bg-cyan-50" : "bg-white"}`}
                            >
                              <td className="px-3 py-2 font-semibold">{row.rank}</td>
                              <td className="px-3 py-2">{row.name}</td>
                              <td className="px-3 py-2">{row.rating}</td>
                              <td className="px-3 py-2">{row.handicap > 0 ? `+${row.handicap}` : row.handicap}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              ) : null}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowPerformance((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <h2 className="text-lg font-semibold text-slate-900">Performance Snapshot</h2>
                  <span className="text-sm text-slate-600">{showPerformance ? "Hide" : "Show"}</span>
                </button>
                {showPerformance ? (
                  <>
                    <div className="mt-3 grid gap-2 sm:grid-cols-5">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Frames Played</p>
                        <p className="text-xl font-semibold text-slate-900">{effectiveSummary.played}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Win %</p>
                        <p className="text-xl font-semibold text-slate-900">{pct(effectiveSummary.won, effectiveSummary.played)}%</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Frames For</p>
                        <p className="text-xl font-semibold text-slate-900">{effectiveSummary.framesFor}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Frames Against</p>
                        <p className="text-xl font-semibold text-slate-900">{effectiveSummary.framesAgainst}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Snooker Match Wins</p>
                        <p className="text-xl font-semibold text-slate-900">{effectiveSummary.snookerWon}/{effectiveSummary.snookerPlayed}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">Recent form (last 10): {effectiveFormGuide}</p>
                  </>
                ) : null}
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowHandicap((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <h2 className="text-lg font-semibold text-slate-900">Handicap</h2>
                  <span className="text-sm text-slate-600">{showHandicap ? "Hide" : "Show"}</span>
                </button>
                {showHandicap ? (
                  <div className="mt-3">
                    <div className="mb-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-xs leading-6 text-fuchsia-950">
                      <p className="font-semibold">How your handicap is adjusted</p>
                      <p className="mt-1">
                        Your snooker Elo rating updates after every valid competitive frame. Handicap is then reviewed from Elo by the league, rather than changing automatically after every win or loss.
                      </p>
                      <p className="mt-1">
                        Each review can move your handicap by a maximum of 4 points toward the target handicap linked to your Elo rating. No-show, nominated-player, and void frames are excluded.
                      </p>
                    </div>
                    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-700">
                      <p className="font-semibold text-slate-900">What your handicap means in points start</p>
                      <p className="mt-1">{handicapExplain}</p>
                      <p className="mt-1">{baselineExplain}</p>
                    </div>
                    {handicapHistory.length === 0 ? (
                      <p className="text-sm text-slate-600">No handicap changes recorded yet.</p>
                    ) : (
                      <div className="max-h-56 overflow-auto rounded-xl border border-slate-200">
                        <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                          <span className="col-span-2">Date</span>
                          <span className="col-span-2">Delta</span>
                          <span className="col-span-2">Handicap</span>
                          <span className="col-span-6">Fixture / Reason</span>
                        </div>
                        {handicapHistory.map((h) => {
                          const fixture = h.fixture_id ? leagueFixtures.find((f) => f.id === h.fixture_id) : null;
                          const homeTeam = fixture ? leagueTeams.find((t) => t.id === fixture.home_team_id)?.name ?? "Home" : null;
                          const awayTeam = fixture ? leagueTeams.find((t) => t.id === fixture.away_team_id)?.name ?? "Away" : null;
                          const fixtureSummary = fixture
                            ? `${homeTeam} ${fixture.home_points ?? 0}-${fixture.away_points ?? 0} ${awayTeam}`
                            : h.reason || "-";
                          return (
                            <div key={h.id} className="grid grid-cols-12 border-b border-slate-100 px-3 py-2 text-xs text-slate-700 last:border-b-0">
                              <span className="col-span-2">{new Date(h.created_at).toLocaleDateString()}</span>
                              <span className={`col-span-2 font-semibold ${h.delta > 0 ? "text-rose-700" : h.delta < 0 ? "text-emerald-700" : "text-slate-700"}`}>
                                {h.delta > 0 ? `+${h.delta}` : h.delta}
                              </span>
                              <span className="col-span-2">{h.previous_handicap}→{h.new_handicap}</span>
                              <span className="col-span-6">{fixtureSummary}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Account & Profile Actions</h2>
                <div className="mb-3 mt-2 flex items-center justify-between gap-3">
                  <p className="text-slate-800">
                    Full name: <span className="font-medium text-slate-900">{player?.full_name ?? "Not set"}</span>
                  </p>
                  {hasAdminPower ? (
                    <div className="flex items-center gap-2">
                      {admin.isSuper ? (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmModal({
                              title: player?.is_archived ? "Restore Player" : "Archive Player",
                              description: player?.is_archived
                                ? "Are you sure you want to restore this player?"
                                : "Are you sure you want to archive this player?",
                              confirmLabel: player?.is_archived ? "Restore" : "Archive",
                              onConfirm: async () => {
                                await onArchiveToggle();
                                setConfirmModal(null);
                              },
                            })
                          }
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700"
                        >
                          {player?.is_archived ? "Restore" : "Archive"}
                        </button>
                      ) : null}
                      {admin.isSuper ? (
                        <button
                          type="button"
                          onClick={() => setDeleteChoiceOpen(true)}
                          className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1 text-sm text-rose-800"
                        >
                          Delete Profile
                        </button>
                      ) : null}
                      {admin.isSuper ? (
                        <button
                          type="button"
                          onClick={() => setEditingPlayer((v) => !v)}
                          className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1 text-sm text-teal-800"
                        >
                          {editingPlayer ? "Close Edit Player" : "Edit Player"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={onEditFullName}
                        disabled={savingName}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 disabled:opacity-60"
                      >
                        {savingName ? "Saving..." : player?.full_name ? "Edit name" : "Add name"}
                      </button>
                    </div>
                  ) : null}
                </div>
                {admin.isSuper ? (
                  <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Date of birth (Super User)</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Current: {player?.date_of_birth ? new Date(`${player.date_of_birth}T12:00:00`).toLocaleDateString() : "Not set"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={quickDobInput}
                        onChange={(e) => setQuickDobInput(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => void onSaveDobQuick()}
                        disabled={savingQuickDob}
                        className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-800 disabled:opacity-60"
                      >
                        {savingQuickDob ? "Saving..." : "Save DOB"}
                      </button>
                    </div>
                  </div>
                ) : null}
                {admin.isSuper && editingPlayer ? (
                  <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Super User: Edit Player</p>
                    <p className="mt-1 text-xs text-slate-600">Date of birth is managed in the dedicated DOB editor above.</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-1">
                      <input
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        placeholder="Full name (or nickname for minors)"
                      />
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={editPhoneNumber}
                        onChange={(e) => setEditPhoneNumber(e.target.value)}
                        placeholder="Phone number (optional)"
                      />
                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={editPhoneConsent}
                          onChange={(e) => setEditPhoneConsent(e.target.checked)}
                        />
                        Share for scheduling
                      </label>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {editIsMinor ? (
                        <select
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          value={editGuardianUserId}
                          onChange={(e) => {
                            const nextUserId = e.target.value;
                            setEditGuardianUserId(nextUserId);
                            const nextUser = appUsers.find((u) => u.id === nextUserId) ?? null;
                            const linked = nextUser?.linked_player_id ? players.find((p) => p.id === nextUser.linked_player_id) : null;
                            const labelName = linked?.full_name?.trim() ? linked.full_name : linked?.display_name;
                            setEditGuardianName(labelName ?? "");
                            setEditGuardianEmail(nextUser?.email ?? "");
                          }}
                        >
                          <option value="">Select registered guardian</option>
                          {appUsers.map((u) => {
                            const linked = players.find((p) => p.id === u.linked_player_id);
                            const labelName = linked?.full_name?.trim() ? linked.full_name : linked?.display_name;
                            const label = labelName ? `${labelName} (${u.email ?? "no email"})` : u.email ?? u.id;
                            return (
                              <option key={u.id} value={u.id}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                      ) : null}
                    </div>
                    {editIsMinor ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          value={editGuardianName}
                          onChange={(e) => setEditGuardianName(e.target.value)}
                          placeholder="Guardian full name"
                        />
                        <input
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          value={editGuardianEmail}
                          onChange={(e) => setEditGuardianEmail(e.target.value)}
                          placeholder="Guardian email"
                          required={editIsMinor}
                          readOnly
                        />
                        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                          <input
                            type="checkbox"
                            checked={editGuardianConsent}
                            onChange={(e) => setEditGuardianConsent(e.target.checked)}
                          />
                          Guardian consent confirmed
                        </label>
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={onSavePlayerEdits}
                        disabled={savingPlayer}
                        className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {savingPlayer ? "Saving..." : "Save Player"}
                      </button>
                    </div>
                  </div>
                ) : null}
                {canEditOwnContact && !admin.isSuper ? (
                  <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">Contact Preferences</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Add a phone number and choose whether it can be shared for match scheduling.
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={editPhoneNumber}
                        onChange={(e) => setEditPhoneNumber(e.target.value)}
                        placeholder="Phone number (optional)"
                      />
                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={editPhoneConsent}
                          onChange={(e) => setEditPhoneConsent(e.target.checked)}
                        />
                        Share for scheduling
                      </label>
                    </div>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={onSaveOwnContact}
                        disabled={savingContact}
                        className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {savingContact ? "Saving..." : "Save contact settings"}
                      </button>
                    </div>
                  </div>
                ) : null}
                <p className="text-xs text-slate-500">
                  Location changes are managed in Team Management → Transfer player.
                </p>
                {!admin.isSuper && player?.claimed_by === userId ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmModal({
                          title: "Request Profile Deletion",
                          description:
                            "Submit a request to the Super User to delete your player profile? If match history exists, the profile may be archived instead.",
                          confirmLabel: "Submit Request",
                          tone: "danger",
                          onConfirm: async () => {
                            setDeleteDataChoiceOpen(true);
                            setConfirmModal(null);
                          },
                        })
                      }
                      className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800"
                    >
                      Request Profile Deletion
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowOpponents((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <h2 className="text-xl font-semibold text-slate-900">Vs Opponents (Singles)</h2>
                  <span className="text-sm text-slate-600">{showOpponents ? "Hide" : "Show"}</span>
                </button>
                {showOpponents ? (
                  <>
                    {effectiveOpponents.length === 0 ? <p className="mt-2 text-slate-600">No singles head-to-head data yet.</p> : null}
                    <div className="mt-2 space-y-2">
                      {effectiveOpponents.map((o) => (
                        <div key={o.opponentId} className="rounded-lg border border-slate-200 px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setOpponentDetail({ opponentId: o.opponentId, opponentName: o.opponent })}
                            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-teal-700"
                          >
                            {o.opponent}
                          </button>
                          <p className="text-slate-700">P {o.played} · W {o.won} · L {o.lost}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <h2 className="text-xl font-semibold text-slate-900">Recent History</h2>
                  <span className="text-sm text-slate-600">{showHistory ? "Hide" : "Show"}</span>
                </button>
                {showHistory ? (
                  <>
                    {leagueHistory.length === 0 ? (
                      <p className="mt-2 text-slate-600">No completed history yet.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {leagueHistory.map((h) => (
                          <button
                            key={h.key}
                            type="button"
                            onClick={() => setHistoryDetail({ fixtureId: h.fixtureId, title: h.label })}
                            className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-slate-300 hover:bg-slate-50"
                          >
                            <div>
                              <p className="font-medium text-slate-900">{h.label}</p>
                              <p className="text-xs text-slate-500">{h.date ? new Date(h.date).toLocaleDateString() : "Date not set"}</p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${h.result === "W" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                              {h.result}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : null}
              </section>
            </>
          ) : null}
        </RequireAuth>
        {opponentDetail ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-[min(92vw,34rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Vs {opponentDetail.opponentName}</h3>
                <button
                  type="button"
                  onClick={() => setOpponentDetail(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                >
                  Close
                </button>
              </div>
              {opponentFrameDetails.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">No frame history found versus this opponent.</p>
              ) : (
                <div className="mt-3 max-h-[56vh] space-y-1.5 overflow-auto">
                  {opponentFrameDetails.map((row) => (
                    <div key={row.key} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{row.frameLabel}</p>
                        <p className="text-xs text-slate-500">{row.date ? new Date(row.date).toLocaleDateString() : "Date not set"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-600">{row.scoreLabel}</p>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${row.result === "W" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                          {row.result}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        {historyDetail ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-[min(94vw,42rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Fixture Frame Details</h3>
                <button
                  type="button"
                  onClick={() => setHistoryDetail(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                >
                  Close
                </button>
              </div>
              <p className="mt-1 text-sm text-slate-700">{historyDetail.title}</p>
              {historyMatchSummary ? (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-900">{historyMatchSummary.line}</p>
                  <p className="text-xs text-slate-500">
                    {historyMatchSummary.date ? new Date(historyMatchSummary.date).toLocaleDateString() : "Date not set"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Your contribution: {historyPlayerContribution.played} frame(s) · W {historyPlayerContribution.won} · L {historyPlayerContribution.lost}
                  </p>
                </div>
              ) : null}
              {historyFrameDetails.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">No player frame details found for this fixture.</p>
              ) : (
                <div className="mt-3 max-h-[56vh] space-y-1.5 overflow-auto">
                  {historyFrameDetails.map((row) => (
                    <div key={row.key} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{row.slotLabel}</p>
                        <p className="text-xs text-slate-500">vs {row.opponentName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-600">{row.scoreLabel}</p>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${row.myResult === "W" ? "bg-emerald-100 text-emerald-800" : row.myResult === "L" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>
                          {row.myResult === "W" ? "Frame won" : row.myResult === "L" ? "Frame lost" : "Not recorded"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        <InfoModal
          open={Boolean(infoModal)}
          title={infoModal?.title ?? ""}
          description={infoModal?.description ?? ""}
          onClose={() => setInfoModal(null)}
        />
        <ConfirmModal
          open={Boolean(confirmModal)}
          title={confirmModal?.title ?? ""}
          description={confirmModal?.description ?? ""}
          confirmLabel={confirmModal?.confirmLabel ?? "Confirm"}
          tone={confirmModal?.tone ?? "default"}
          onCancel={() => setConfirmModal(null)}
          onConfirm={() => confirmModal?.onConfirm()}
        />
        <ConfirmModal
          open={deleteDataChoiceOpen}
          title="Delete Personal Data Too?"
          description="If selected, we will remove personal profile data where possible. If match history exists, match outcomes are retained for opponents and your profile will be anonymized and archived."
          confirmLabel="Yes, delete personal data"
          cancelLabel="No, keep match-linked data"
          onCancel={async () => {
            setDeleteDataChoiceOpen(false);
            await onRequestDeleteProfile(false);
          }}
          onConfirm={async () => {
            setDeleteDataChoiceOpen(false);
            await onRequestDeleteProfile(true);
          }}
        />
        {deleteChoiceOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
              <h2 className="text-lg font-semibold text-slate-900">Delete Player Profile</h2>
              <p className="mt-2 text-sm text-slate-700">
                Choose how to remove this profile. Archiving keeps historical stats. Permanent delete removes the profile
                and unlinks any account.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteChoiceOpen(false)}
                  disabled={Boolean(deleteActionBusy)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onArchivePlayerNow}
                  disabled={Boolean(deleteActionBusy)}
                  className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {deleteActionBusy === "archive" ? "Archiving..." : "Archive profile"}
                </button>
                <button
                  type="button"
                  onClick={onDeletePlayerNow}
                  disabled={Boolean(deleteActionBusy)}
                  className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {deleteActionBusy === "delete" ? "Deleting..." : "Delete permanently"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
