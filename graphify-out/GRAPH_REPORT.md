# Graph Report - luzly  (2026-08-25)

## Corpus Check
- Large corpus: 748 files · ~624,086 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 4448 nodes · 10974 edges · 277 communities (204 shown, 73 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 155 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 172
- Community 173
- Community 174
- Community 175
- Community 176
- Community 177
- Community 178
- Community 180
- Community 181
- Community 182
- Community 183
- Community 184
- Community 185
- Community 186
- Community 187
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- Community 194
- Community 195
- Community 196
- Community 197
- Community 199
- Community 200
- Community 201
- Community 202
- Community 203
- Community 204
- Community 205
- Community 206
- Community 207
- Community 208
- Community 209
- Community 210
- Community 211
- Community 212
- Community 213
- Community 214
- Community 215
- Community 216
- Community 217
- Community 218
- Community 219
- Community 220
- Community 229
- Community 230
- Community 231
- Community 232
- Community 233
- Community 234
- Community 235
- Community 236
- Community 238
- Community 239
- Community 240
- Community 241
- Community 242
- Community 243
- Community 244
- Community 245
- Community 246
- Community 247
- Community 248
- Community 249
- Community 250
- Community 251
- Community 252
- Community 253
- Community 254
- Community 255
- Community 256
- Community 257
- Community 258
- Community 259
- Community 260
- Community 261
- Community 262
- Community 263
- Community 264
- Community 265
- Community 266
- Community 267
- Community 268
- Community 269
- Community 270
- Community 271
- Community 272
- Community 273
- Community 274

## God Nodes (most connected - your core abstractions)
1. `Person` - 88 edges
2. `Event` - 83 edges
3. `LocalNow` - 75 edges
4. `parseCalendarDate()` - 74 edges
5. `getNotificationServiceClient()` - 71 edges
6. `DutyFamily` - 51 edges
7. `/graphify Command` - 40 edges
8. `Panel()` - 37 edges
9. `RawSheet` - 37 edges
10. `PersonalEventView` - 37 edges

## Surprising Connections (you probably didn't know these)
- `מי-מה-מו Permanent Engineering Rules` --semantically_similar_to--> `Honesty Rules`  [INFERRED] [semantically similar]
  CLAUDE.md → .claude/skills/graphify/SKILL.md
- `recordDashboardVisit()` --references--> `public.record_dashboard_visit()`  [INFERRED]
  src/lib/dashboardVisit/store.ts → supabase/migrations/20260825090000_create_dashboard_visit_state.sql
- `claimDuePendingChanges()` --references--> `public.claim_due_pending_notification_changes()`  [INFERRED]
  src/lib/notifications/engine/store.ts → supabase/migrations/20260815130000_create_notification_engine.sql
- `claimDueNotificationJobs()` --references--> `public.claim_due_notification_jobs()`  [INFERRED]
  src/lib/notifications/engine/store.ts → supabase/migrations/20260815130000_create_notification_engine.sql
- `Mi-Ma-Mo App Symbol` --semantically_similar_to--> `Next.js App Icon`  [INFERRED] [semantically similar]
  public/brand/symbol.png → src/app/icon.png

## Import Cycles
- 3-file cycle: `src/lib/readModels/managerEventProjections.ts -> src/lib/readModels/managerTypes.ts -> src/lib/readModels/shiftSnapshot.ts -> src/lib/readModels/managerEventProjections.ts`
- 3-file cycle: `src/lib/readModels/managerTypes.ts -> src/lib/readModels/shiftSnapshot.ts -> src/lib/readModels/permanentManagerHomeTypes.ts -> src/lib/readModels/managerTypes.ts`

## Hyperedges (group relationships)
- **Automatic notification worker tick orchestration** — src_lib_notifications_engine_readme_pipeline, src_lib_notifications_engine_readme_scheduledworker, src_lib_notifications_engine_readme_delivery, src_lib_notifications_engine_readme_reminders, src_lib_notifications_engine_readme_recurringruledispatch [EXTRACTED 1.00]
- **Fairness V1: independent Shift and Duty modes on shared foundation** — src_lib_domain_readme_fairnessfoundation, src_lib_domain_readme_fairnessshiftengine, src_lib_domain_readme_dutyfairness_integration, src_lib_readmodels_readme_shiftfairness, src_lib_readmodels_readme_dutyfairness [EXTRACTED 1.00]
- **Incremental Update Pipeline** — graphify_detect_detect_incremental, graphify_build_build_merge, graphify_detect_save_manifest [EXTRACTED 1.00]
- **Semantic Cache Keyed to Extraction Prompt** — graphify_cache_check_semantic_cache, graphify_cache_save_semantic_cache, _claude_skills_graphify_references_extraction_spec_prompt [EXTRACTED 1.00]
- **Read-Only Snapshot Architecture Pattern** — claude_engineering_rules, src_components_ui_readme_datafreshnessstatus, src_components_readme_personalschedulereadmodel [INFERRED 0.75]
- **Google Sheets -> parsers -> domain -> read models read-only pipeline** — src_lib_google_readme_fetchrawworkbooksnapshot, src_lib_sync_readme_workbooksnapshotcache, src_lib_parsers_readme_lib_parsers, src_lib_domain_readme_lib_domain, src_lib_readmodels_readme_lib_readmodels [INFERRED 0.85]

## Communities (277 total, 73 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (75): CATEGORY_TO_JOB_CATEGORY, ChangeDetectionSummary, resolveBaselineTransition(), resolvePersonRecipient(), runChangeDetection(), settleOneChange(), SILENT_SUMMARY_BASE, JobOutcome (+67 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (47): buildDutyBlockView(), DutiesPage(), DutiesPageProps, getRequestDutyFairness, getRequestPersonalSchedule, DutiesHeader(), DutiesHeaderProps, DutyBlockList() (+39 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (49): POST(), loadRoute(), runScheduledBroadcastWorkerTick, POST(), loadRoute(), runNotificationWorkerTick, SupabaseServiceRoleConfigError, DeliverySummary (+41 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (48): main(), calendarMonthOfLocalNow(), formatMonthParam(), parseMonthParam(), resolveShiftFairnessMonth(), resolveReportOneTargetDate(), deriveReserveRoleParticipation(), buildShiftSchedule() (+40 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (49): SettingsPage(), getCalendarFeedForCurrentUser, getRequestPersonalSchedule, OK_PERSON, redirect, resolveRequestOrigin, CalendarSyncSection(), CalendarSyncSectionProps (+41 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (43): PersonalPerspectiveProps, CalendarGrid(), CalendarGridProps, CALENDAR_CELL_HEIGHT_CLASSES, CalendarDayCell(), CalendarDayCellProps, CalendarWeekdayHeader(), CalendarWeekRow() (+35 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (34): getRequestManagerOverview, shiftSnapshotShift(), shiftSnapshotTriad(), usePathname, useRouter, useSearchParams, getRequestSchedule, managerSelfModel() (+26 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (49): buildAssignmentView(), buildManagerAbsenceRowView(), buildManagerDutyRowView(), buildManagerIssueRowView(), buildManagerPotentialRowView(), buildManagerShiftDayViews(), buildSelectedPersonIssueView(), COVERAGE_ISSUE_REASONS (+41 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (35): assignmentEvent(), getRequestPersonalSchedule, shiftEvent(), AdjacentShiftContextRow(), AdjacentShiftContextRowProps, CounterpartPanel(), CounterpartPanelProps, assignment() (+27 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (43): PulseIndicator(), PulseIndicatorProps, CandidateLink(), IssueRow(), IssueRowProps, RecommendationDisclosure(), renderTextParts(), ROOT_CLASS (+35 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (52): public.notification_rules, audienceLabel(), CustomWeeklyRuleRow(), handleArchive(), handleToggleEnabled(), ERROR_LABELS, errorLabel(), ManagerFixedNotificationsSectionProps (+44 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (39): TimeRange(), TimeRangeProps, describeEvent(), parseClock(), statusOf(), dutyEvent(), shiftEvent(), TimelineItem (+31 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (36): EVENT_COLOR_KEYWORD, IcsColorInput, icsEventColor(), RFC-7986, ABSENCE_EMOJI, DUTY_FAMILY_EMOJI, IcsEmojiInput, icsEventEmoji() (+28 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (34): ICS_FEED_PAST_WINDOW_DAYS, icsFeedCutoffDate(), isWithinIcsFeedWindow(), NOW, daysInCalendarMonth(), addCalendarDays(), FIXED_RANGE_DAY_COUNTS, formatCalendarDate() (+26 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (44): classifyAssignmentTemporalState(), classifyDutyTemporalState(), classifyShiftTemporalState(), isEventStillRelevant(), resolveNowMinuteOnEventTimeline(), baseEvent(), dutyEvent(), nextCell() (+36 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (40): compareDutyActions(), DerivedDutyAction, DerivedDutyActionType, deriveDutyActions(), baseEvent(), dutyEvent(), guardEvent(), nextCell() (+32 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (43): parseLocalDate(), toIsoDate(), EMPTY_TARGETS, FAIRNESS_HEADER_LABELS, FairnessHeaderLocation, findFairnessHeader(), findFairnessTargets(), groupPeopleByNormalizedName() (+35 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (41): extractAvatarUrl(), computeNotificationReadiness(), PersonNotificationReadiness, resolvePersonReadiness(), AuthAccountLookup, fetchAllSubscribedUserIds(), fetchAllUserIdsByEmail(), NonPermanentConstraintsRecipient (+33 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (45): BroadcastUnresolvedPerson, isSameLogicalBroadcastRequest(), MANAGER_BROADCAST_CATEGORY, resolveAudience(), sameIdSet(), SendManagerBroadcastInput, sendManagerBroadcastNotification(), SendManagerBroadcastOutcome (+37 more)

### Community 19 - "Community 19"
Cohesion: 0.08
Nodes (35): getAuthenticatedIdentity(), findPersonByEmail(), normalizeEmailForComparison(), PersonEmailLookupResult, resolveCurrentPerson(), resolveCurrentPersonFromPeople(), ResolveCurrentPersonResult, resolveIdentityAgainstPeople() (+27 more)

### Community 20 - "Community 20"
Cohesion: 0.08
Nodes (30): heebo, metadata, viewport, IdentityFooterThemeAction(), MobileProfileMenu(), OPTIONS, ThemeToggle(), ThemeToggleProps (+22 more)

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (33): CATEGORY_OPTIONS, ManagerCategoryNav(), ManagerCategoryNavProps, BASE, linkStatus, ManagerCommandBar(), ManagerCommandBarProps, CURRENT (+25 more)

### Community 22 - "Community 22"
Cohesion: 0.10
Nodes (28): getGoogleSheetsContext(), GoogleSheetsContext, SHEETS_READONLY_SCOPE, GoogleServiceAccountConfig, normalizePrivateKey(), readGoogleServiceAccountConfig(), ENV_KEYS, originalEnv (+20 more)

### Community 23 - "Community 23"
Cohesion: 0.07
Nodes (31): ManagerBroadcastComposerProps, ADOPTION, createScheduledBroadcastAction, editScheduledBroadcastAction, ROSTER, sendManagerBroadcastAction, ADOPTION, ROSTER (+23 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (28): AuthIdentityResult, createSupabaseServerClient, getUser, getRequestAuthenticatedIdentity, getAuthenticatedIdentity, timedStage(), timedSyncStage(), loadPersonalScheduleReadModel (+20 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (37): buildPotentialDutyEvents(), buildPotentialDutyEventsForRoster(), buildPotentialDutyEventsFromPersonAllocations(), compareAllocationsForReconciliation(), isSameCalendarWeek(), resolveCoveredPersonalAllocations(), resolveCoveredSlottedAllocations(), resolvePersonAllocations() (+29 more)

### Community 26 - "Community 26"
Cohesion: 0.08
Nodes (30): AUDIENCE_OPTIONS, AudienceKind, ERROR_LABELS, errorLabel(), ManagerBroadcastComposer(), handleSubmit(), resetForm(), minuteOfDayToTimeValue() (+22 more)

### Community 27 - "Community 27"
Cohesion: 0.09
Nodes (23): ManagerDutiesAbsencesSection(), ManagerDutiesAbsencesSectionProps, ManagerPotentialRow(), ROOT_CLASS, STATUS_ICON, STATUS_LABEL, STATUS_TEXT_CLASS, ManagerPotentialSection() (+15 more)

### Community 28 - "Community 28"
Cohesion: 0.08
Nodes (27): firstParam(), scheduleHref(), SchedulePage(), SchedulePageProps, SearchParamValue, ConfigurationErrorState(), ScheduleCalendar(), dayMeta() (+19 more)

### Community 29 - "Community 29"
Cohesion: 0.08
Nodes (32): audienceLabel(), ERROR_LABELS, errorLabel(), ManagerScheduledBroadcastsSection(), handleConfirmCancel(), handleSendNow(), load(), STATUS_LABELS (+24 more)

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (37): personnelTypeGroupLabel(), buildDisambiguationResults(), buildSplitDisambiguationResults(), choosePersonPair(), ChosenPairResolution, currentShiftFor(), findMatchingPeople(), MatchTier (+29 more)

### Community 31 - "Community 31"
Cohesion: 0.08
Nodes (24): NotificationCenterPage(), NotificationCenterPageProps, SearchParamValue, ADOPTION, composerProps, fixedSectionProps, getRequestNotificationCenterContext, linkStatus (+16 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (26): APP_REVALIDATE_EVENT, AppRevalidator(), handlePageShow(), handleVisibilityChange(), requestRevalidate(), scheduleNextPeriodicRefresh(), refresh, NotificationInboxStatus (+18 more)

### Community 33 - "Community 33"
Cohesion: 0.09
Nodes (26): CARD_ACCENT_CLASS, DayCard(), ManagerCoverageSection(), ManagerCoverageSectionProps, ROLE_TONE_CLASS, coverage(), dayView(), group() (+18 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (23): getCurrentSubscription(), getOrCreateSubscription(), disablePushNotificationsAction, enableFirst(), enablePushNotificationsAction, FakePushSubscription, getPushSubscriptionStatusAction, installBrowserPushEnvironment() (+15 more)

### Community 35 - "Community 35"
Cohesion: 0.12
Nodes (29): daysBetweenCalendarDates(), toOrdinalDay(), computePeriodElapsedPercent(), DUTY_PACE_TOLERANCE_PERCENTAGE_POINTS, DutyPaceStatus, resolveDutyPaceStatus(), DutyFairnessStatus, fairnessPeriodEndDate() (+21 more)

### Community 36 - "Community 36"
Cohesion: 0.12
Nodes (31): OperationalIssue, ReserveRoleParticipation, buildShiftCoverageRecommendation(), combineRegularThenReserve(), compareCandidates(), datesTouchedByMissingIntervals(), dayOffsetMinutes(), hasBlockingAbsence() (+23 more)

### Community 37 - "Community 37"
Cohesion: 0.12
Nodes (28): buildCoverageGapCopy(), buildDutyChangeCopy(), buildSettledChangeCopy(), buildShiftChangeCopy(), buildTeamChangeCopy(), NotificationCopy, onWeekday(), parseFactKey() (+20 more)

### Community 38 - "Community 38"
Cohesion: 0.06
Nodes (33): eslint, eslint-config-next, jsdom, devDependencies, eslint, eslint-config-next, jsdom, pg (+25 more)

### Community 39 - "Community 39"
Cohesion: 0.12
Nodes (23): ROLE_MESSAGE_TONE_CLASS, RoleCoverageMessage(), ShiftSnapshotCard(), ShiftSnapshotCardProps, RESOLVED_TIMING, AbsenceRow(), TodayOperationalContext(), TodayOperationalContextProps (+15 more)

### Community 40 - "Community 40"
Cohesion: 0.10
Nodes (19): ManagerAdoptionSection(), ManagerAdoptionSectionProps, ManagerAdoptionSummary(), ManagerAdoptionSummaryProps, AdoptionGroupView, AdoptionPersonRowView, AdoptionStatView, buildHeadline() (+11 more)

### Community 41 - "Community 41"
Cohesion: 0.08
Nodes (15): BellOnboardingCard, BellOnboardingInput, deriveBellOnboardingCard(), deriveInstallGuidance(), InstallGuidance, BASE, BellView, ICON_SIZE_CLASSES (+7 more)

### Community 42 - "Community 42"
Cohesion: 0.11
Nodes (23): FairnessPeriodStatus, FairnessComparisonGroupKey, FairnessShiftStatus, resolveShiftFairnessPeriodDates(), resolveShiftFairnessPeriodStatus(), SHIFT_FAIRNESS_BALANCED_TOLERANCE_SHIFTS, ShiftFairnessGroupResult, absenceEvent() (+15 more)

### Community 43 - "Community 43"
Cohesion: 0.09
Nodes (17): GoogleGlyph(), GoogleSignInButton(), handleSignIn(), GoogleSignInButtonProps, createSupabaseBrowserClient, signInWithOAuth, createSupabaseBrowserClient(), readSupabasePublicConfig() (+9 more)

### Community 44 - "Community 44"
Cohesion: 0.07
Nodes (15): Graphify Skill Trigger, --watch Flow, Token Reduction Benchmark (Step 8), FalkorDB Export (Step 7a), GraphML Export (Step 7c), Neo4j Export (Step 7), SVG Export (Step 7b), Wiki Export (Step 6b) (+7 more)

### Community 45 - "Community 45"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 46 - "Community 46"
Cohesion: 0.09
Nodes (13): dynamic, ProtectedLayout(), getRequestPersonalSchedule, getRequestSearchReadModel, redirect, AccessDeniedScreen(), AccessDeniedSignOutButton(), AppShell() (+5 more)

### Community 47 - "Community 47"
Cohesion: 0.12
Nodes (24): audienceLabel(), buildTimingLine(), fallbackDeliveryLabel(), isUnresolvedPushCapable(), ManagerRecentBroadcastsSection(), handleClear(), load(), scheduleNextLoad() (+16 more)

### Community 48 - "Community 48"
Cohesion: 0.14
Nodes (21): fairnessDataCompleteness, buildFairnessComparisonGroups(), buildFairnessPersonContext(), FairnessComparisonGroup, FairnessPersonContext, GROUP_ORDER, FairnessEligibilityRole, FairnessParticipationBasis (+13 more)

### Community 49 - "Community 49"
Cohesion: 0.11
Nodes (19): DUTY_GROUP_LABEL, FairnessAuthFailureStatus, FairnessPage(), FairnessPageProps, firstParam(), renderAuthFailure(), renderShiftFairnessView(), SearchParamValue (+11 more)

### Community 50 - "Community 50"
Cohesion: 0.16
Nodes (21): dynamic, LoginPage(), LoginPageProps, IssuesPanel(), IssuesPanelProps, WeekDayCard(), ISSUE_SEVERITY_RING_CLASS, parseCalendarDate() (+13 more)

### Community 51 - "Community 51"
Cohesion: 0.16
Nodes (23): combineFairnessDataCompleteness(), COMPLETE_FAIRNESS_DATA, countFairnessWeekendDates(), FAIRNESS_MODEL_VERSION, FairnessDataCompletenessReason, fairnessWeekendBucketKey(), isFairnessWeekendDate(), resolveFairnessPeriodStatus() (+15 more)

### Community 52 - "Community 52"
Cohesion: 0.13
Nodes (20): PersonReadinessResult, getRequestNotificationCenterContext, loadNotificationCenterContext, AdoptionReadinessLookup, buildManagerRoster(), compareAdoptionPeople(), compareRosterEntries(), toManagerAdoptionPerson() (+12 more)

### Community 53 - "Community 53"
Cohesion: 0.14
Nodes (15): BottomNav(), BottomNavLinkProps, linkStatus, usePathname, NavItem, navItems, visibleNavItems(), Sidebar() (+7 more)

### Community 54 - "Community 54"
Cohesion: 0.11
Nodes (22): buildPersonNameIndex(), canonicalizeForAliasComparison(), classifyPotentialSourceOwnership(), collapseWhitespace(), isManagerOwnedPotentialAllocation(), KNOWN_EXTERNAL_LEADING_TOKENS, leadingToken(), normalizeFullName() (+14 more)

### Community 55 - "Community 55"
Cohesion: 0.11
Nodes (20): batchStore, claimStore, createFakeBatchStore(), getById(), createFakeClaimStore(), claim(), complete(), listRecoverable() (+12 more)

### Community 56 - "Community 56"
Cohesion: 0.09
Nodes (16): clearNotificationInboxAction, disablePushNotificationsAction, enableFirst(), enablePushNotificationsAction, FakeBeforeInstallPromptEvent, FakePushSubscription, getNotificationInboxAction, getPushSubscriptionStatusAction (+8 more)

### Community 57 - "Community 57"
Cohesion: 0.13
Nodes (15): alwaysReady(), DEFAULT_PWA_INSTALL_STATE, notIosOnFirstRender(), notStandaloneOnFirstRender(), notYetReady(), PwaInstallContext, PwaInstallContextValue, PwaInstallProvider() (+7 more)

### Community 58 - "Community 58"
Cohesion: 0.15
Nodes (22): buildIssueDedupeKey(), dedupeIssues(), detectBlockingAbsenceIssues(), detectCapabilityMismatchIssues(), detectOperationalIssues(), detectShiftTimingIssues(), groupByPersonAndDate(), isAssignmentEvent() (+14 more)

### Community 59 - "Community 59"
Cohesion: 0.08
Nodes (10): EVENING, FakeBatchRow, FakeDeliveryRow, FakeInboxJobRow, FakeJobRow, FakeRow, FakeScheduledTimingRow, loadModule() (+2 more)

### Community 60 - "Community 60"
Cohesion: 0.16
Nodes (20): buildManagerShiftGroupView(), CounterpartRow(), assignmentEmoji(), periodLabel(), ManagerRoleCoverageRoleName, ROLE_DISPLAY_LABEL, roleCoverageMessage(), buildScheduleEveryoneDayViews() (+12 more)

### Community 61 - "Community 61"
Cohesion: 0.15
Nodes (16): Dashboard(), findVacationEvent(), AssignmentTiming, buildDayIndicators(), CalendarDayIndicator, eventIndicator(), eventIndicatorEmoji(), eventIndicatorLabel() (+8 more)

### Community 62 - "Community 62"
Cohesion: 0.13
Nodes (22): ActiveDutyBlockInfo, CompletedDutyAllocationResult, computeCompletedDutyAllocation(), datesOverlap(), DayBasedDutyFamily, DUTY_ALLOCATION_WEIGHT_BY_FAMILY, FlatAllocationDutyFamily, GUARD_RESERVE_BLOCK_WEIGHT (+14 more)

### Community 63 - "Community 63"
Cohesion: 0.20
Nodes (22): analyzeRoleCoverage(), analyzeShiftCounterparts(), analyzeUnitShiftCoverage(), canonicalWindowForPeriod(), clipInterval(), computeMissingIntervals(), findShiftGroupEvents(), hasMultiSupervisorStaffing() (+14 more)

### Community 64 - "Community 64"
Cohesion: 0.09
Nodes (23): client-only, googleapis, @hebcal/core, lucide-react, next, dependencies, client-only, googleapis (+15 more)

### Community 65 - "Community 65"
Cohesion: 0.17
Nodes (12): manifest(), PUBLIC_DIR, BrandMark(), BrandMarkProps, SIZE_CLASSES, LoginHeaderLogo(), ManagerForbiddenState(), ManagerSourceOfTruthNote() (+4 more)

### Community 66 - "Community 66"
Cohesion: 0.28
Nodes (22): dayOfWeek(), nextCalendarDateString(), isLogisticsWithdrawalFallbackDate(), ALMASH_CHECKIN_DUTY_FAMILIES, applyReminderJobs(), buildAndApplyConstraintsJobs(), formatMinuteAsClock(), NoonReminderCategorySummary (+14 more)

### Community 67 - "Community 67"
Cohesion: 0.13
Nodes (16): AllocationGroup, allocationIdentity(), buildResult(), EXACT_SLOT_FAMILIES, hasBlockingAbsence(), ManagerRequirementActualAssignee, ManagerRequirementReconciliation, MULTIPLICITY_FAMILIES (+8 more)

### Community 68 - "Community 68"
Cohesion: 0.09
Nodes (20): cancelManagerScheduledBroadcastIfEditable, claimDueManagerScheduledBroadcasts, claimManagerScheduledBroadcastNow, fetchAllSubscribedUserIds, fetchAllUserIdsByEmail, getManagerNotificationBatchById, getManagerScheduledBroadcastByCreateIdempotencyKey, getManagerScheduledBroadcastById (+12 more)

### Community 69 - "Community 69"
Cohesion: 0.16
Nodes (14): signInWithOAuth, LoginErrorNotice(), ICON_TONE, ICONS, LoginFeatureStrip(), LoginHero(), LoginHeroProps, LOGIN_AUTH_NOTE (+6 more)

### Community 70 - "Community 70"
Cohesion: 0.13
Nodes (14): CommandPaletteProps, ambiguousRosterModel(), fixtureModel(), push, roniWeissModel(), SearchPaletteContext, SearchPaletteContextValue, SearchPaletteProvider() (+6 more)

### Community 71 - "Community 71"
Cohesion: 0.16
Nodes (20): addOneDay(), buildBlockFromEvents(), buildDutyBlocks(), compareDutyBlocks(), compareEventsForBlockOrder(), computeWeekendCompleteness(), daysInMonth(), dedupeByReference() (+12 more)

### Community 72 - "Community 72"
Cohesion: 0.16
Nodes (17): ALLOCATION_ROLE_BY_LABEL, computeGapToTarget(), computeNormalizedLoad(), computeScoreDelta(), FairnessAllocationRole, FairnessDisplayedRowsSum, resolveComparisonTarget(), resolveDutyFairnessStatus() (+9 more)

### Community 73 - "Community 73"
Cohesion: 0.14
Nodes (13): FairnessPeriodIdentity, FairnessPersonRow, FairnessTableParseResult, FairnessTargets, FairnessTotalsRow, EMPTY_RESERVE_ROLE_PARTICIPATION, ReserveRoleParticipationByPeriod, ReserveRoleParticipationSource (+5 more)

### Community 74 - "Community 74"
Cohesion: 0.14
Nodes (21): BLOCKING_ABSENCE_WORDING, buildReportOneDraft(), DUTY_FAMILY_ORDER, DUTY_FAMILY_WORDING, dutyAddendumText(), EXCLUDED_REPORT_ONE_NAMES, isAdditiveDutyEvent(), isAssignmentEvent() (+13 more)

### Community 75 - "Community 75"
Cohesion: 0.18
Nodes (16): buildSupervisorAssignedInformedBody(), buildTeamHelpAssignedBody(), comparePersonRef(), findLogisticsWithdrawalAssignees(), hasAnyAbsence(), hasBlockingDayConstraint(), joinNamesWithVav(), LogisticsPersonRef (+8 more)

### Community 76 - "Community 76"
Cohesion: 0.12
Nodes (15): daySupervisorShift(), dayTechnicianShift(), defaultRuleConfig(), dutyEvent(), emptyRecipientResolution, event(), fetchAllSubscribedUserIds, loadModule() (+7 more)

### Community 77 - "Community 77"
Cohesion: 0.10
Nodes (17): listRecentManagerNotificationBatches(), ManagerBroadcastDeliveryTiming, RECENT_MANAGER_BROADCASTS_LIMIT, getRecentManagerBroadcastsAction(), GetRecentManagerBroadcastsResult, isValidRequestShape(), RecentManagerBroadcastView, sendManagerBroadcastAction() (+9 more)

### Community 78 - "Community 78"
Cohesion: 0.11
Nodes (20): Project Layout, BottomNav, GoogleSignInButton, IdentityFooter, MonthNav, components/ Directory Overview, PersonalScheduleReadModel, ScheduleHeader (+12 more)

### Community 79 - "Community 79"
Cohesion: 0.20
Nodes (15): buildDayMeta(), Header(), HeaderProps, firstNameOf(), greetingEmojiForMinuteOfDay(), greetingForMinuteOfDay(), formatHebrewCalendarDate(), formatHebrewMonthRange() (+7 more)

### Community 80 - "Community 80"
Cohesion: 0.13
Nodes (13): ShellUtilityBar(), ShellUtilityBarProps, LoginClockReadout(), LoginClockReadoutProps, clockFormatter, LiveClock(), LiveClockProps, SIZE_CLASSES (+5 more)

### Community 81 - "Community 81"
Cohesion: 0.19
Nodes (16): buildIcsLine(), escapeIcsText(), foldIcsLine(), RFC-5545, exclusiveAllDayEnd(), formatIcsDateOnly(), formatIcsDateTimeUtc(), IcsCalendarItem (+8 more)

### Community 82 - "Community 82"
Cohesion: 0.16
Nodes (16): classifyPersonnelType(), classifyRoleGroup(), FairnessRoleGroupKey, isShiftCapable(), RoleGroupable, classifyReportOneSection(), groupRosterHierarchy(), PERSONNEL_TYPE_GROUP_LABEL (+8 more)

### Community 83 - "Community 83"
Cohesion: 0.14
Nodes (17): ABSENCE_KIND_BY_PHRASE, classify(), CONSTRAINT_PERIOD_TOKENS, CONTEXT_PHRASES, DutyMatch, EXACT_DUTY_PHRASES, isChangeNote(), normalizeText() (+9 more)

### Community 84 - "Community 84"
Cohesion: 0.13
Nodes (14): name, private, scripts, build, dev, lint, start, test (+6 more)

### Community 85 - "Community 85"
Cohesion: 0.16
Nodes (9): FairnessStatusBadge(), FairnessStatusBadgeProps, fairnessStatusTintTextClass(), STATUS_TINT_CLASSES, ShiftFairnessCard(), METRIC_EXPLANATIONS, ShiftFairnessCardInfo(), FairnessStatus (+1 more)

### Community 86 - "Community 86"
Cohesion: 0.13
Nodes (15): AUDIENCE_OPTIONS, AudienceKind, ERROR_LABELS, errorLabel(), ManagerRecurringRuleComposer(), ManagerRecurringRuleComposerProps, minuteOfDayToTimeValue(), parseTimeValue() (+7 more)

### Community 87 - "Community 87"
Cohesion: 0.16
Nodes (16): absenceEvent(), activityEvent(), dayMeta(), daysForGrid(), dutyEvent(), HOLIDAY, shiftEvent(), WEEK_DATES (+8 more)

### Community 88 - "Community 88"
Cohesion: 0.15
Nodes (11): CATEGORY_EMOJI, formatChangeCountLabel(), formatMoreChangesLabel(), RecentChangesPanel(), RecentChangesPanelProps, NOW, InboxItemRow(), formatRecentChangeRelativeTime() (+3 more)

### Community 89 - "Community 89"
Cohesion: 0.15
Nodes (15): CommandPalette(), activate(), handleInputKeyDown(), handleKeyDown(), EXAMPLE_QUERIES, getFocusableElements(), NO_SHARED_SHIFT_OVERRIDES, periodEmoji() (+7 more)

### Community 90 - "Community 90"
Cohesion: 0.18
Nodes (13): DisablePushResult, EnablePushResult, getPushSubscriptionStatusAction(), PushSubscriptionStatus, sendTestNotificationAction(), SendTestNotificationResult, findPushSubscriptionForCurrentUser(), resolveSafeNotificationPath() (+5 more)

### Community 91 - "Community 91"
Cohesion: 0.25
Nodes (13): buildExpectationFactorLabel(), buildShiftFairnessCardView(), buildShiftStatusExplanationLabel(), buildTargetPeriodLabel(), SHIFT_COMPLETENESS_MESSAGES, shiftFairnessCompletenessNote(), fairShiftRangeBounds, formatFairShiftRange() (+5 more)

### Community 92 - "Community 92"
Cohesion: 0.19
Nodes (15): parseHebrewWeekdayName(), normalizeSearchQuery(), classifyToken(), FILLER_WORDS, parseExplicitDateToken(), parseSearchIntent(), PERIOD_WORDS, ScannedTokens (+7 more)

### Community 93 - "Community 93"
Cohesion: 0.27
Nodes (16): renderDutyFairnessView(), exemptionBadgeLabel(), formatDutyStatusLabel(), formatFairnessDelta(), formatFairnessDeviationState(), formatFairnessExpectedValue(), formatFairnessGap(), formatFairnessScore() (+8 more)

### Community 94 - "Community 94"
Cohesion: 0.14
Nodes (17): EMPTY_POTENTIAL_SHEET(), getJerusalemLocalNow, getWorkbookSnapshot, HISTORY_SCHEDULE_SHEET, makeHistorySnapshot(), makeSnapshot(), makeSwapSnapshot(), NOW (+9 more)

### Community 95 - "Community 95"
Cohesion: 0.12
Nodes (9): FakeRow, loadModule(), makeFakeNotificationRulesClient(), matches(), query(), updateQuery(), makeFakeOccurrenceClient(), RaceRuleState (+1 more)

### Community 96 - "Community 96"
Cohesion: 0.12
Nodes (13): archiveCustomWeeklyRule, getNotificationRuleById, insertCustomWeeklyRule, listActiveNotificationRules, loadManagerPersonnelContext, loadManagerWorkbookContext, MANAGER, okOutcome() (+5 more)

### Community 97 - "Community 97"
Cohesion: 0.16
Nodes (16): buildFairnessSheet(), EITAN, FAIRNESS_HEADER, fairnessRow(), FairnessRowInput, H1_TARGET_LEGEND_ROW, H1_TARGET_VALUE_ROW, h1Sheet() (+8 more)

### Community 98 - "Community 98"
Cohesion: 0.18
Nodes (11): DashboardVisitMarker(), DashboardVisitMarkerProps, recordDashboardVisitAction, recordDashboardVisitAction(), RecordDashboardVisitResult, getAuthenticatedIdentity, recordDashboardVisit, getDashboardVisitServiceClient() (+3 more)

### Community 99 - "Community 99"
Cohesion: 0.16
Nodes (9): DUTY_STATUS_TINT_CLASSES, DutyFairnessCard(), DutyFairnessDetail(), DutyFairnessDetailProps, DutyProgressBar(), FairnessMetric(), FairnessMetricProps, DutyStatusState (+1 more)

### Community 100 - "Community 100"
Cohesion: 0.23
Nodes (12): FairnessDutyPeriodNav(), FairnessDutyPeriodNavProps, PERIOD_OPTIONS, FairnessModeToggle(), FairnessModeToggleProps, linkStatus, FairnessPeriodKey, fairnessDutiesHref() (+4 more)

### Community 101 - "Community 101"
Cohesion: 0.21
Nodes (9): ShiftFairnessDetail(), ShiftFairnessDetailProps, ShiftFairnessRoleSection(), ShiftFairnessRoleSectionProps, PersonnelServiceCategory, ShiftFairnessCardView, groupShiftFairnessCardsByServiceType(), SERVICE_SUBGROUP_ORDER (+1 more)

### Community 102 - "Community 102"
Cohesion: 0.24
Nodes (11): buildGeneratedStatusMap(), getFocusableElements(), ReportOneEditorOverlay(), handleKeyDown(), ReportOneEditorOverlayProps, useMounted(), formatReportOneDateDot(), formatReportOneDateSlash() (+3 more)

### Community 103 - "Community 103"
Cohesion: 0.22
Nodes (9): ServiceWorkerManager(), FakeEventTarget, FakeRegistration, getPwaCapabilities(), isBrowser(), PwaCapabilities, supportsNotifications(), supportsPushManager() (+1 more)

### Community 104 - "Community 104"
Cohesion: 0.19
Nodes (11): AdjacentShiftPeriod, nextShiftPeriod(), previousShiftPeriod(), resolveCurrentShiftPeriod(), canonicalInterval(), resolveShiftOverviewEntry(), resolveShiftSnapshotTriad(), nextCell() (+3 more)

### Community 105 - "Community 105"
Cohesion: 0.15
Nodes (11): RFC-8030, readVapidServerConfig(), ENV_KEYS, originalEnv, VapidConfigError, VapidServerConfig, NotificationPayload, ensureVapidConfigured() (+3 more)

### Community 106 - "Community 106"
Cohesion: 0.20
Nodes (13): signOutAction(), withTimeout(), deletePushSubscriptionForCurrentUser(), PushSubscriptionRow, StoredPushSubscription, toStoredSubscription(), upsertPushSubscriptionForCurrentUser(), RawPushSubscription (+5 more)

### Community 107 - "Community 107"
Cohesion: 0.17
Nodes (16): analyzeShiftCounterparts, buildPotentialDutyEventsForRoster, deriveDutyActions, buildDutyBlocks, detectOperationalIssues, buildPotentialDutyEvents, reconcilePotentialAllocations, classifyPotentialSourceOwnership / scopeManagerPotentialAllocation (+8 more)

### Community 108 - "Community 108"
Cohesion: 0.12
Nodes (14): fetchFreshWorkbookRead, findDueCustomWeeklyOccurrences, loadModule(), loadNotificationRuleConfig, peekDueJobsCount, peekDueManagerScheduledBroadcastsCount, PEOPLE, resolveNotificationRecipients (+6 more)

### Community 109 - "Community 109"
Cohesion: 0.15
Nodes (12): allocation(), buildModel(), EITAN, EMPTY_SOURCE, event(), MANAGER, MARTIN, nextCell() (+4 more)

### Community 110 - "Community 110"
Cohesion: 0.25
Nodes (11): ResolvedTiming, ShiftProgress(), ShiftProgressProps, NOW, refresh, ResolvedTiming, formatHoursPart(), formatMinutesHebrew() (+3 more)

### Community 111 - "Community 111"
Cohesion: 0.19
Nodes (13): allocation(), DANIEL_A, DANIEL_B, dutyEvent(), guardAllocation(), NADAV, nextCell(), PERSONNEL (+5 more)

### Community 112 - "Community 112"
Cohesion: 0.19
Nodes (11): createSupabaseServerClient, deleteEqMock, makeFakeSupabaseClient(), rpcMock, selectMaybeSingleMock, SUBSCRIPTION, isReasonableBase64Url(), parseBrowserSubscription() (+3 more)

### Community 113 - "Community 113"
Cohesion: 0.21
Nodes (12): allocation(), baseEvent(), build(), colleagueShift(), FORBIDDEN_KEYS, localNow(), me(), myAbsence() (+4 more)

### Community 114 - "Community 114"
Cohesion: 0.17
Nodes (14): AUTHENTICATED_MANAGER, computeNotificationReadiness, DEFAULT_PARAMS, fetchAllUserIdsByEmail, getJerusalemLocalNow, getRequestAuthenticatedIdentity, getWorkbookSnapshot, MANAGER_PERSONNEL_ROWS (+6 more)

### Community 115 - "Community 115"
Cohesion: 0.18
Nodes (13): ScheduleParams, DEFAULT_PARAMS, getAuthenticatedIdentity, getRequestPersonalSchedule, getWorkbookSnapshot, MANAGER_PERSONNEL_ROWS, managerSnapshot(), personnelSheet() (+5 more)

### Community 116 - "Community 116"
Cohesion: 0.26
Nodes (7): IdentityFooterSignOutButton(), MobileProfileMenuProps, SignOutMenuItem(), PushEndpointHiddenField(), getCurrentPushEndpoint, getCurrentPushEndpoint(), unsubscribeCurrentPushSubscription()

### Community 117 - "Community 117"
Cohesion: 0.14
Nodes (9): cancelScheduledBroadcast, createScheduledBroadcast, editScheduledBroadcast, listActiveManagerScheduledBroadcasts, loadManagerPersonnelContext, loadManagerWorkbookContext, MANAGER, PEOPLE (+1 more)

### Community 118 - "Community 118"
Cohesion: 0.24
Nodes (12): dutyModel(), dutyRow(), getRequestDutyFairness, getRequestShiftFairness, noTargetModel(), ratzModel(), redirect, renderFairnessPage() (+4 more)

### Community 119 - "Community 119"
Cohesion: 0.28
Nodes (8): PermanentManagerHome(), PermanentManagerHomeProps, model(), shift(), ReportOneQuickAction(), ReportOneQuickActionProps, ReportOneDraft, PermanentManagerHomeReadModel

### Community 120 - "Community 120"
Cohesion: 0.15
Nodes (13): signOutAction, resolveCalendarFeedOwnerByToken, calendar serviceClient.ts, lib/notifications/engine, engine serviceClient.ts, store.ts, lib/notifications, subscriptionStore.ts (+5 more)

### Community 121 - "Community 121"
Cohesion: 0.15
Nodes (11): fetchFreshPersonnelRead, findDueCustomWeeklyOccurrences, loadModule(), loadNotificationRuleConfig, peekAnyManagerScheduledBroadcastWorkDue, peekDueJobsCount, PEOPLE, runDelivery (+3 more)

### Community 122 - "Community 122"
Cohesion: 0.18
Nodes (11): allocation(), AUGUST_DATES, DANIEL, EITAN, event(), MANAGER, nextCell(), NOA (+3 more)

### Community 123 - "Community 123"
Cohesion: 0.23
Nodes (11): contextFor(), contextForSwap(), contextWithFormerEmployee(), FAIRNESS_HEADER, fairnessSheet(), getJerusalemLocalNow, loadFairnessWorkbookContext, okContext() (+3 more)

### Community 124 - "Community 124"
Cohesion: 0.22
Nodes (12): { fakeUnstableCache, fakeRevalidateTag }, fetchRawWorkbookSnapshot, getAuthenticatedIdentity, getJerusalemLocalNow, PERSONNEL_ROWS, personnelSheet(), potentialH1Sheet(), potentialH2Sheet() (+4 more)

### Community 125 - "Community 125"
Cohesion: 0.21
Nodes (9): public.notification_rules_protect_identity, upsertPendingSystemReminderJob(), notification_rules_protect_identity_trigger, public.cancel_pending_system_reminder_job(), public.claim_notification_rule_occurrence(), public.notification_rule_occurrences, public.notification_rules, public.upsert_pending_system_reminder_job() (+1 more)

### Community 126 - "Community 126"
Cohesion: 0.20
Nodes (11): public.push_subscriptions, public.advance_notification_baseline(), public.claim_due_notification_jobs(), public.claim_due_pending_notification_changes(), public.notification_baseline_state, public.notification_deliveries, public.notification_jobs, public.observed_notification_facts (+3 more)

### Community 127 - "Community 127"
Cohesion: 0.23
Nodes (8): GET(), loadCalendarFeedForToken, loadRoute(), VALID_TOKEN, CalendarFeedLoadResult, getSheetByKey(), loadCalendarFeedForToken(), REQUIRED_SOURCES

### Community 128 - "Community 128"
Cohesion: 0.20
Nodes (7): PersonPickerLeadingOption, PersonPickerPerson, PersonPickerProps, PopupRow, SelectableRow, BASE_PROPS, PersonGroupable

### Community 129 - "Community 129"
Cohesion: 0.23
Nodes (10): AssignmentTemporalState, EventRole, ShiftFactEntry, ShiftMatch, SearchRosterPerson, SearchShiftEvent, ACTIVE_STATES, compareSharedShifts() (+2 more)

### Community 130 - "Community 130"
Cohesion: 0.23
Nodes (7): isSystemRuleKey(), SYSTEM_RULE_KEYS, SystemRuleConfig, SystemRuleKey, toCustomWeeklyRuleConfig(), toSystemRuleConfig(), NotificationRuleRow

### Community 131 - "Community 131"
Cohesion: 0.21
Nodes (10): fairnessSnapshot(), fetchEmailToAvatarUrl, getAuthenticatedIdentity, getRequestPersonalSchedule, getWorkbookSnapshot, PERSONNEL_ROWS, personnelSheet(), potentialSheet() (+2 more)

### Community 132 - "Community 132"
Cohesion: 0.21
Nodes (11): getAuthenticatedIdentity, getJerusalemLocalNow, getWorkbookSnapshot, PERMANENT_MANAGER_ROWS, PERMANENT_NON_MANAGER_ROWS, personnelSheet(), REGULAR_MANAGER_ROWS, scheduleSheet() (+3 more)

### Community 133 - "Community 133"
Cohesion: 0.24
Nodes (11): getAuthenticatedIdentity, getJerusalemLocalNow, getWorkbookSnapshot, PERSONNEL_ROWS, personnelSheet(), potentialH1Sheet(), potentialH2Sheet(), scheduleSheet() (+3 more)

### Community 134 - "Community 134"
Cohesion: 0.32
Nodes (8): ilay2(), me(), model(), roniWeissModel(), rosterPerson(), SELF_REF, tuviaModel(), twoMatchesModel()

### Community 135 - "Community 135"
Cohesion: 0.18
Nodes (8): ADOPTION, archiveCustomWeeklyRuleAction, composerCalls, listNotificationRulesAction, ROSTER, setCustomWeeklyRuleEnabledAction, systemEditorCalls, updateSystemRuleAction

### Community 136 - "Community 136"
Cohesion: 0.22
Nodes (5): Capture(), FakeBeforeInstallPromptEvent, serverRenderThenHydrate(), tree(), usePwaInstall()

### Community 137 - "Community 137"
Cohesion: 0.22
Nodes (7): ScheduleManagerSelector(), ScheduleManagerSelectorProps, PEOPLE, push, useRouter, useSearchParams, ScheduleRosterOption

### Community 138 - "Community 138"
Cohesion: 0.29
Nodes (5): CalendarFeedOwnerLookupResult, resolveCalendarFeedOwnerByToken(), getCalendarFeedServiceClient(), createSupabaseServiceRoleClient(), SupabaseServiceRoleConfigError

### Community 139 - "Community 139"
Cohesion: 0.20
Nodes (11): Person, recipients.ts, personnel.ts, lib/notifications/engine/readiness.ts computeNotificationReadiness, dutyFairness.ts, fairnessAvatarLookup.ts, lib/presentation/fairnessCards.ts, fairnessWorkbookContext.ts (+3 more)

### Community 141 - "Community 141"
Cohesion: 0.18
Nodes (9): claimDueManagerScheduledBroadcasts(), claimManagerScheduledBroadcastNow(), peekAnyManagerScheduledBroadcastWorkDue(), public.claim_due_manager_scheduled_broadcasts(), public.claim_manager_scheduled_broadcast_now(), public.manager_scheduled_broadcasts, public.manager_notification_batches, public.claim_due_manager_scheduled_broadcasts() (+1 more)

### Community 142 - "Community 142"
Cohesion: 0.18
Nodes (10): AUTHENTICATED, clearNotificationInbox, getAuthenticatedIdentity, getInboxClearedBefore, getInboxJobsForRecipient, getReadJobIds, isEligibleInboxJobForRecipient, loadNotificationInbox (+2 more)

### Community 143 - "Community 143"
Cohesion: 0.24
Nodes (10): getAuthenticatedIdentity, getJerusalemLocalNow, getWorkbookSnapshot, NON_MANAGER_ROWS, PERMANENT_MANAGER_ROWS, personnelSheet(), REGULAR_MANAGER_ROWS, scheduleSheet() (+2 more)

### Community 144 - "Community 144"
Cohesion: 0.20
Nodes (7): ALLOWED_SERVICE_ROLE_REFERENCE_FILES, CALENDAR_SERVICE_ROLE_CALL_SITE_FILE, DASHBOARD_VISIT_SERVICE_ROLE_CALL_SITE_FILE, NOTIFICATION_SERVICE_ROLE_CALL_SITE_FILE, SERVICE_ROLE_DEFINITION_FILE, sourceFiles, srcRoot

### Community 145 - "Community 145"
Cohesion: 0.31
Nodes (6): DashboardProps, DashboardVisitSession(), DashboardVisitSessionProps, ORIGINAL_RECAP, recordDashboardVisitAction, DashboardVisitRecap

### Community 146 - "Community 146"
Cohesion: 0.22
Nodes (6): FLOATING_CARDS, FloatingCardSpec, LoginScheduleRing(), SWEEP_HAND_LEAD, SWEEP_HAND_TRAIL, TICKS

### Community 147 - "Community 147"
Cohesion: 0.33
Nodes (8): PersonPicker(), closeMenu(), handleButtonKeyDown(), handlePointerDown(), handlePopupKeyDown(), openMenu(), renderOptionRow(), selectRow()

### Community 148 - "Community 148"
Cohesion: 0.22
Nodes (10): getAuthenticatedIdentity, calendar actions.ts, fetchRawWorkbookSnapshot, freshRead.ts, notifications actions.ts, getRequestAuthenticatedIdentity, getRequestPersonalSchedule, loadPersonalScheduleReadModel (+2 more)

### Community 149 - "Community 149"
Cohesion: 0.20
Nodes (10): Duty Fairness integration (PR #3), fairnessAnalysis.ts, fairnessExemptions.ts, fairnessFoundation.ts, fairnessParticipation.ts, fairnessPeriod.ts, fairnessShiftEngine.ts, fairnessTable.ts (+2 more)

### Community 150 - "Community 150"
Cohesion: 0.31
Nodes (9): getRecentSettledJobsForRecipient(), CATEGORY_FALLBACK_HREF, DASHBOARD_VISIT_RECAP_VISIBLE_LIMIT, deriveHref(), EMPTY_RECAP_AT(), extractSafeDate(), loadDashboardVisitRecap(), PERSONAL_CHANGE_CATEGORIES (+1 more)

### Community 151 - "Community 151"
Cohesion: 0.24
Nodes (7): EITAN, fullDataRow(), h1Sheet(), h1SheetWithFairnessTable(), MARTIN, personnel, REAL_HEADER_ROW

### Community 152 - "Community 152"
Cohesion: 0.20
Nodes (7): ENV_KEYS, FakeWebPushError, originalEnv, PAYLOAD, sendNotification, setVapidDetails, SUBSCRIPTION

### Community 153 - "Community 153"
Cohesion: 0.31
Nodes (9): getRequestAuthenticatedIdentity, getWorkbookSnapshot, MANAGER_PERSONNEL_ROWS, managerSnapshot(), personnelOnlySnapshot(), personnelSheet(), potentialSheet(), scheduleSheet() (+1 more)

### Community 154 - "Community 154"
Cohesion: 0.27
Nodes (9): getJerusalemLocalNow, getRequestAuthenticatedIdentity, getWorkbookSnapshot, PERSONNEL_ROWS, personnelSheet(), scheduleSheet(), SETTINGS_ROWS_VALID, settingsSheet() (+1 more)

### Community 155 - "Community 155"
Cohesion: 0.27
Nodes (8): fairnessSheet(), getJerusalemLocalNow, loadFairnessWorkbookContext, okContext(), parseEvent, parseScheduleSheet, person(), scheduleSheet()

### Community 156 - "Community 156"
Cohesion: 0.28
Nodes (9): /graphify explain Flow, LESSONS.md, /graphify path Flow, /graphify query Flow, Work Memory / save-result Self-Improving Loop, Constrained Query Expansion (Step 0), Graphify Integration Section, graphify reflect (CLI) (+1 more)

### Community 157 - "Community 157"
Cohesion: 0.25
Nodes (7): getRequestDashboardVisitRecap, getRequestPermanentManagerHome, getRequestPersonalSchedule, getRequestReportOneTomorrow, permanentManagerHomeModel(), recordDashboardVisitAction, shift()

### Community 158 - "Community 158"
Cohesion: 0.31
Nodes (6): FairnessDetailOverlay(), handleKeyDown(), FairnessDetailOverlayProps, getFocusableElements(), push, useMounted()

### Community 159 - "Community 159"
Cohesion: 0.31
Nodes (9): formatBadgeCount(), noStoredDismissalOnFirstRender(), NotificationBell(), closePopover(), dismissInstallCard(), handleItemClick(), handleKeyDown(), handlePointerDown() (+1 more)

### Community 160 - "Community 160"
Cohesion: 0.22
Nodes (7): LocalClockTime, LOGISTICS_WITHDRAWAL_WINDOW, LOGISTICS_WITHDRAWAL_WINDOW_END, LOGISTICS_WITHDRAWAL_WINDOW_START, MinuteWindow, SEMANTIC_CHANGE_DEBOUNCE_MINUTES, WORKER_CADENCE_MINUTES

### Community 161 - "Community 161"
Cohesion: 0.22
Nodes (6): RecentSettledJobRow, RecentSettledJobsResult, getAuthenticatedIdentity, getLastVisitedAt, getRecentSettledJobsForRecipient, NOW

### Community 162 - "Community 162"
Cohesion: 0.28
Nodes (8): ALL_PATTERNS, PERSON_PERSON_PATTERNS, query(), SELF, SELF_PATTERNS, SharedShiftPattern, splitConjunctionCandidates(), SharedShiftPersonPair

### Community 163 - "Community 163"
Cohesion: 0.43
Nodes (8): Mi-Ma-Mo Full Logo Lockup, Mi-Ma-Mo Wordmark Logo, Mi-Ma-Mo App Symbol, PWA Icon 192x192, PWA Icon 512x512, PWA Maskable Icon 512x512, Apple Touch Icon, Next.js App Icon

### Community 164 - "Community 164"
Cohesion: 0.46
Nodes (4): DashboardPage(), getRequestPermanentManagerHome, getRequestDashboardVisitRecap, getRequestReportOneTomorrow

### Community 165 - "Community 165"
Cohesion: 0.36
Nodes (4): GET(), createSupabaseServerClient, exchangeCodeForSession, sanitizeNextPath()

### Community 166 - "Community 166"
Cohesion: 0.25
Nodes (8): feedStore.ts, lib/calendar, lib/domain, lib/google, lib/parsers, lib/readModels, lib/sync, 20260820090000_create_calendar_feeds.sql

### Community 167 - "Community 167"
Cohesion: 0.25
Nodes (8): classifyAssignmentTemporalState, computeAssignmentTiming, fairnessGroups.ts, classifyPersonnelType / classifyRoleGroup / isShiftCapable, resolveEventShiftInterval, shiftSchedule.ts, logisticsCoordination.ts, shiftSnapshot.ts / resolveShiftSnapshotTriad

### Community 168 - "Community 168"
Cohesion: 0.39
Nodes (6): absenceEvent(), dutyEvent(), event(), nextCell(), shiftEvent(), UNKNOWN_REPORT_ONE_STATUS

### Community 169 - "Community 169"
Cohesion: 0.25
Nodes (7): AUTHENTICATED, deletePushSubscriptionForCurrentUser, findPushSubscriptionForCurrentUser, getAuthenticatedIdentity, sendPush, upsertPushSubscriptionForCurrentUser, VALID_RAW_SUBSCRIPTION

### Community 170 - "Community 170"
Cohesion: 0.32
Nodes (8): delivery.ts, pipeline.ts, recurringRuleDispatch.ts, ruleConfig.ts, scheduledWorker.ts, Fixed / Recurring Notifications Center, Manager scheduled broadcasts (PR #79), sendPush.ts

### Community 171 - "Community 171"
Cohesion: 0.25
Nodes (8): buildManagerFairnessReadModel, getRequestManagerFairness, getRequestManagerOverview, loadManagerFairnessReadModel, loadManagerOverviewReadModel, loadManagerWorkbookContext / loadManagerPersonnelContext, lib/parsers/fairness.ts parseFairnessTable, lib/config/timingDiagnostics.ts

### Community 172 - "Community 172"
Cohesion: 0.29
Nodes (4): /graphify add Flow, Post-Commit Hook (graphify hook), --update (Incremental Re-extraction), detect.save_manifest()

### Community 173 - "Community 173"
Cohesion: 0.29
Nodes (7): Confidence Score Rubric, Hyperedge Extraction Rule, Node ID Format Rule, Extraction Subagent Prompt, Semantic Similarity Edge Rule, source_file Verbatim Rule, build_merge()

### Community 174 - "Community 174"
Cohesion: 0.29
Nodes (6): ALL_LOGIN_SOURCE, componentsDir, globalsCss, googleButtonSource, loginComponentFiles, pageSource

### Community 175 - "Community 175"
Cohesion: 0.48
Nodes (3): Avatar(), AvatarProps, initialsOf()

### Community 176 - "Community 176"
Cohesion: 0.57
Nodes (5): INSTALL_PROMPT_COOLDOWN_MS, isInstallPromptDismissalActive(), markInstallPromptDismissed(), readInstallPromptDismissedAt(), storageKey()

### Community 177 - "Community 177"
Cohesion: 0.33
Nodes (6): findPersonByEmail, resolveCurrentPerson, resolveCurrentPersonFromPeople, resolveIdentityAgainstPeople, icsWindow.ts, loadCalendarFeedForToken

### Community 180 - "Community 180"
Cohesion: 0.33
Nodes (3): FakeClient, loadServiceWorker(), SW_SOURCE

### Community 181 - "Community 181"
Cohesion: 0.40
Nodes (5): Honesty Rules, Next.js Agent Rules Block, מי-מה-מו Permanent Engineering Rules, CI verify Job, Project Overview

### Community 182 - "Community 182"
Cohesion: 0.50
Nodes (4): public.notification_jobs, public.notification_inbox_state, public.notification_reads, auth.users

### Community 183 - "Community 183"
Cohesion: 0.40
Nodes (4): createSupabaseServerClient, deletePushSubscriptionForCurrentUser, redirect, signOut

### Community 184 - "Community 184"
Cohesion: 0.70
Nodes (4): feedLookupMock, getCalendarFeedServiceClient, getUserByIdMock, makeFakeServiceClient()

### Community 185 - "Community 185"
Cohesion: 0.40
Nodes (5): Event, logisticsWithdrawal.ts, event.ts, schedule.ts, RawAssignment

### Community 186 - "Community 186"
Cohesion: 0.70
Nodes (4): absence(), baseEvent(), constraint(), nextCell()

### Community 190 - "Community 190"
Cohesion: 0.50
Nodes (4): icsEventColor, icsEventEmoji, emoji.ts / assignmentEmoji, eventColor.ts

### Community 191 - "Community 191"
Cohesion: 0.50
Nodes (4): buildShiftRosterDescription, analyzeUnitShiftCoverage, shiftCoverage.ts / buildShiftRoster, semanticFacts.ts

### Community 195 - "Community 195"
Cohesion: 0.83
Nodes (4): makeFakeSupabase(), batchesTable(), matches(), scheduledTable()

### Community 196 - "Community 196"
Cohesion: 0.50
Nodes (3): public.dashboard_visit_state, public.record_dashboard_visit(), auth.users

### Community 201 - "Community 201"
Cohesion: 0.67
Nodes (3): DayMeta, @hebcal/core, ScheduleCalendar

### Community 210 - "Community 210"
Cohesion: 0.67
Nodes (3): notificationPath.ts, ServiceWorkerManager.tsx, public/sw.js

## Knowledge Gaps
- **1116 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+1111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **73 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Person` connect `Community 15` to `Community 0`, `Community 3`, `Community 13`, `Community 14`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 22`, `Community 151`, `Community 24`, `Community 25`, `Community 155`, `Community 36`, `Community 168`, `Community 42`, `Community 48`, `Community 178`, `Community 51`, `Community 52`, `Community 54`, `Community 55`, `Community 58`, `Community 66`, `Community 67`, `Community 68`, `Community 74`, `Community 75`, `Community 97`, `Community 109`, `Community 111`, `Community 113`, `Community 122`, `Community 123`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `parseCalendarDate()` connect `Community 50` to `Community 2`, `Community 3`, `Community 5`, `Community 10`, `Community 12`, `Community 13`, `Community 14`, `Community 17`, `Community 18`, `Community 150`, `Community 25`, `Community 28`, `Community 35`, `Community 36`, `Community 51`, `Community 62`, `Community 66`, `Community 71`, `Community 75`, `Community 76`, `Community 79`, `Community 81`, `Community 87`, `Community 102`, `Community 104`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `LocalNow` connect `Community 15` to `Community 1`, `Community 129`, `Community 3`, `Community 6`, `Community 8`, `Community 10`, `Community 11`, `Community 13`, `Community 14`, `Community 17`, `Community 25`, `Community 28`, `Community 30`, `Community 35`, `Community 39`, `Community 168`, `Community 42`, `Community 51`, `Community 55`, `Community 61`, `Community 66`, `Community 67`, `Community 70`, `Community 73`, `Community 74`, `Community 76`, `Community 79`, `Community 104`, `Community 109`, `Community 113`, `Community 119`, `Community 122`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _1116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0453781512605042 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05221518987341772 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06573426573426573 - nodes in this community are weakly interconnected._