// The Template editor: change a layout's settings and watch one of your titles follow, then save them into the YAML.
// Drawn with Preact and htm (web/vendor). Its state is the plain `tpl` object below: whatever changes it calls tplDraw() (or tplChanged(),
// which also asks for a new preview), and the components only read it. Edits are kept per layout and Poster/Season; the server renders a
// small preview of each change in memory. This file runs before app.js and uses its helpers ($, api, toast, titles...) only when called.
const html = htm.bind(preact.h), vrender = preact.render;
const {useState, useLayoutEffect} = preactHooks;
const ALIGN = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];
const logoOn = v => v.logo_mode !== 'none', textOn = v => v.text_overlay_enabled, borderOn = v => v.border_enabled;
const logoShadowOn = v => logoOn(v) && v.uniform_logo_shadow_enabled;
const matteOn = v => v.matte_height_ratio > 0 || v.fade_height_ratio > 0;
const badgeOn = (...names) => v => names.some(n => v.badges.includes(n));
const badgeText = badgeOn('resolution', 'edition', 'status');
const bannerOn = badgeOn('status_banner'), bannerBorderOn = v => bannerOn(v) && v.status_banner_border_width > 0;
const bannerStrokeOn = v => bannerOn(v) && v.status_banner_stroke_width > 0, bannerShadowOn = v => bannerOn(v) && v.status_banner_shadow_strength > 0;
const strokeOn = v => badgeText(v) && v.badge_stroke_width > 0, shadowOn = v => badgeText(v) && v.badge_shadow_strength > 0;
const vignetteOn = v => v.vignette_strength > 0, grainOn = v => v.grain_amount > 0;
const radialOn = v => vignetteOn(v) && v.vignette_mode === 'radial';
const textStrokeOn = v => textOn(v) && v.text_stroke_width > 0, textShadowOn = v => textOn(v) && v.text_shadow_strength > 0;
const flowOn = v => badgeText(v) && v.badge_layout === 'flow';
const badgeCorner = badgeOn('resolution', 'edition', 'status', 'codec', 'audience_score', 'streaming');
const streamingOn = badgeOn('streaming'), streamingShadowOn = v => streamingOn(v) && v.streaming_logo_shadow_enabled;
const badgeArtOn = badgeOn('edition', 'codec', 'audience_score'), badgeArtShadowOn = v => badgeArtOn(v) && v.badge_art_shadow_enabled;
const BADGE_NAMES = [['gradient_top', 'Top gradient'], ['gradient_bottom', 'Bottom gradient'], ['resolution', 'Resolution'], ['edition', 'Edition'], ['codec', 'Audio codec'], ['status', 'Show status'], ['audience_score', 'Audience score'], ['streaming', 'Streaming service logo (TV)'], ['status_banner', 'Status banner (TV)']];
const BANNER_CATEGORIES = [['new_show', 'New show'], ['new_season', 'New season soon'], ['new_season_started', 'New season started'], ['upcoming_episode', 'Upcoming episode'], ['new_episode', 'New Episode'],
  ['upcoming_finale', 'Upcoming finale'], ['season_finale', 'Season finale out'], ['final_episode', 'Final episode out'], ['returning', 'Returning'], ['ended', 'Ended'], ['canceled', 'Canceled']];
const TPL_GROUPS = [
  ['Image', [
    {k: 'poster_zoom', label: 'Zoom', min: 0.5, max: 2, step: 0.01},
    {k: 'poster_shift_y', label: 'Move up or down', min: -0.5, max: 0.5, step: 0.005},
    {k: 'poster_shift_x', label: 'Move left or right', min: -0.5, max: 0.5, step: 0.005},
    {k: 'matte_height_ratio', label: 'Matte height', min: 0, max: 0.5, step: 0.005},
    {k: 'fade_height_ratio', label: 'Matte fade', min: 0, max: 1, step: 0.005},
    {k: 'fade_smoothness', label: 'Fade smoothness', min: 0, max: 1, step: 0.01, when: matteOn},
    {k: 'matte_opacity', label: 'Matte opacity', min: 0, max: 1, step: 0.01, when: matteOn},
    {k: 'matte_color', label: 'Matte color', color: true, when: matteOn},
    {k: 'vignette_strength', label: 'Vignette', min: 0, max: 1, step: 0.01},
    {k: 'vignette_mode', label: 'Vignette type', choices: [['classic', 'Even dim'], ['radial', 'Radial']], when: vignetteOn},
    {k: 'vignette_color', label: 'Vignette color', color: true, when: vignetteOn},
    {k: 'vignette_size', label: 'Vignette size', min: 0.2, max: 3, step: 0.05, when: radialOn},
    {k: 'vignette_falloff', label: 'Vignette falloff', min: 0.2, max: 5, step: 0.05, when: radialOn},
    {k: 'grain_amount', label: 'Grain', min: 0, max: 0.6, step: 0.01},
    {k: 'grain_mode', label: 'Grain type', choices: [['blend', 'Blend'], ['film', 'Film']], when: grainOn},
    {k: 'grain_size', label: 'Grain size', min: 0, max: 10, step: 0.1, when: grainOn}]],
  ['Logo', [
    {k: 'logo_mode', label: 'Logo', choices: [['original', 'Show'], ['none', 'Hide']]},
    {k: 'uniform_logo_max_w', label: 'Max width', min: 1, max: 2000, int: true, when: logoOn},
    {k: 'uniform_logo_max_h', label: 'Max height', min: 1, max: 1500, int: true, when: logoOn},
    {k: 'uniform_logo_offset_x', label: 'Across', min: 0, max: 1, step: 0.005, when: logoOn},
    {k: 'uniform_logo_offset_y', label: 'Down', min: 0, max: 1, step: 0.005, when: logoOn},
    {k: 'uniform_logo_h_align', label: 'Align across', choices: ALIGN, when: logoOn},
    {k: 'uniform_logo_v_align', label: 'Align down', choices: [['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom']], when: logoOn},
    {k: 'uniform_logo_center_below', label: 'Center logos shorter than', min: 0, max: 1000, int: true, when: logoOn},
    {k: 'uniform_logo_trim', label: 'Trim logo padding', bool: true, when: logoOn},
    {k: 'uniform_logo_shadow_enabled', label: 'Logo shadow', bool: true, when: logoOn},
    {k: 'uniform_logo_shadow_color', label: 'Shadow color', color: true, when: logoShadowOn},
    {k: 'uniform_logo_shadow_opacity', label: 'Shadow opacity (%)', min: 0, max: 100, int: true, when: logoShadowOn},
    {k: 'uniform_logo_shadow_angle', label: 'Shadow angle (°)', min: -180, max: 180, int: true, when: logoShadowOn},
    {k: 'uniform_logo_shadow_distance', label: 'Shadow distance', min: 0, max: 100, int: true, when: logoShadowOn},
    {k: 'uniform_logo_shadow_size', label: 'Shadow size / blur', min: 0, max: 250, int: true, when: logoShadowOn},
    {k: 'uniform_logo_shadow_spread', label: 'Shadow spread (%)', min: 0, max: 100, int: true, when: logoShadowOn}]],
  ['Text', [
    {k: 'text_overlay_enabled', label: 'Text', bool: true},
    {k: 'custom_text', label: 'Words', text: '{title} {year} {season} {season_number}', when: textOn},
    {k: 'font_size', label: 'Size', min: 10, max: 400, int: true, when: textOn},
    {k: 'letter_spacing', label: 'Letter spacing', min: 0, max: 10, int: true, when: textOn},
    {k: 'position_y', label: 'Down', min: 0, max: 1, step: 0.005, when: textOn},
    {k: 'position_x', label: 'Across', min: 0, max: 1, step: 0.005, when: textOn},
    {k: 'text_line_spacing', label: 'Line spacing', min: 0, max: 2, step: 0.05, when: textOn},
    {k: 'text_transform', label: 'Case', choices: [['none', 'As typed'], ['uppercase', 'ABC'], ['lowercase', 'abc']], when: textOn},
    {k: 'text_color', label: 'Color', color: true, when: textOn},
    {k: 'text_stroke_width', label: 'Stroke', min: 0, max: 20, step: 0.5, when: textOn},
    {k: 'text_stroke_opacity', label: 'Stroke opacity', min: 0, max: 1, step: 0.01, when: textStrokeOn},
    {k: 'text_stroke_color', label: 'Stroke color', color: true, when: textStrokeOn},
    {k: 'text_shadow_strength', label: 'Shadow', min: 0, max: 1, step: 0.01, when: textOn},
    {k: 'text_shadow_blur', label: 'Shadow blur', min: 0, max: 60, step: 0.5, when: textShadowOn},
    {k: 'text_shadow_offset_y', label: 'Shadow offset', min: -40, max: 40, step: 0.5, when: textShadowOn},
    {k: 'text_shadow_color', label: 'Shadow color', color: true, when: textShadowOn}]],
  ['Border', [
    {k: 'border_enabled', label: 'Border', bool: true},
    {k: 'border_px', label: 'Width', min: 0, max: 120, int: true, when: borderOn},
    {k: 'border_radius', label: 'Corner radius', min: 0, max: 300, int: true, when: borderOn},
    {k: 'border_color', label: 'Color', color: true, when: borderOn}]],
  ['Badges', [
    {k: 'badges', label: 'Show', badges: true},
    {k: 'badge_layout', label: 'Layout', choices: [['kometa', 'Kometa boxes'], ['flow', 'Flow']], when: badgeText},
    {k: 'badge_margin', label: 'Margin', min: 0, max: 100, step: 1, when: badgeCorner},
    {k: 'badge_gap', label: 'Gap between badges', min: 0, max: 100, step: 1, when: flowOn},
    {k: 'badge_fit', label: 'Shrink text to fit', bool: true, when: badgeText},
    {k: 'badge_art_scale', label: 'Codec, IMAX and score size', min: 0.25, max: 3, step: 0.05, when: badgeOn('edition', 'codec', 'audience_score')}], true],
  ['Gradients', [
    {k: 'badge_gradient_top_height', label: 'Top height', min: 0.01, max: 1, step: 0.01, when: badgeOn('gradient_top')},
    {k: 'badge_gradient_top_strength', label: 'Top strength', min: 0, max: 1, step: 0.01, when: badgeOn('gradient_top')},
    {k: 'badge_gradient_bottom_height', label: 'Bottom height', min: 0.01, max: 1, step: 0.01, when: badgeOn('gradient_bottom')},
    {k: 'badge_gradient_bottom_strength', label: 'Bottom strength', min: 0, max: 1, step: 0.01, when: badgeOn('gradient_bottom')},
    {k: 'badge_gradient_color', label: 'Color', color: true, when: badgeOn('gradient_top', 'gradient_bottom')}], true],
  ['Resolution, edition and status', [
    {k: 'resolution_font_size', label: 'Resolution size', min: 10, max: 200, int: true, when: badgeOn('resolution')},
    {k: 'edition_font_size', label: 'Edition and status size', min: 10, max: 200, int: true, when: badgeOn('edition', 'status')},
    {k: 'badge_text_color', label: 'Text color', color: true, when: badgeText},
    {k: 'badge_text_transform', label: 'Text case', choices: [['uppercase', 'ABC'], ['lowercase', 'abc'], ['none', 'As written']], when: badgeText},
    {k: 'badge_stroke_width', label: 'Text stroke', min: 0, max: 10, step: 0.5, when: badgeText},
    {k: 'badge_stroke_opacity', label: 'Stroke opacity', min: 0, max: 1, step: 0.01, when: strokeOn},
    {k: 'badge_stroke_color', label: 'Stroke color', color: true, when: strokeOn},
    {k: 'badge_shadow_strength', label: 'Text shadow', min: 0, max: 1, step: 0.01, when: badgeText},
    {k: 'badge_shadow_blur', label: 'Shadow blur', min: 0, max: 30, step: 0.5, when: shadowOn},
    {k: 'badge_shadow_offset_y', label: 'Shadow offset', min: -20, max: 20, step: 0.5, when: shadowOn},
    {k: 'badge_shadow_color', label: 'Shadow color', color: true, when: shadowOn}], true],
  ['Audience score', [
    {k: 'audience_score_text_color', label: 'Text color', color: true, when: badgeOn('audience_score')},
    {k: 'audience_score_font_size', label: 'Text size', min: 10, max: 200, step: 1, when: badgeOn('audience_score')}], true],
  ['Codec, IMAX and score shadow', [
    {k: 'badge_art_shadow_enabled', label: 'Shadow', bool: true, when: badgeArtOn},
    {k: 'badge_art_shadow_color', label: 'Shadow color', color: true, when: badgeArtShadowOn},
    {k: 'badge_art_shadow_opacity', label: 'Shadow opacity (%)', min: 0, max: 100, int: true, when: badgeArtShadowOn},
    {k: 'badge_art_shadow_angle', label: 'Shadow angle (°)', min: -180, max: 180, int: true, when: badgeArtShadowOn},
    {k: 'badge_art_shadow_distance', label: 'Shadow distance', min: 0, max: 50, int: true, when: badgeArtShadowOn},
    {k: 'badge_art_shadow_size', label: 'Shadow size / blur', min: 0, max: 125, int: true, when: badgeArtShadowOn},
    {k: 'badge_art_shadow_spread', label: 'Shadow spread (%)', min: 0, max: 100, int: true, when: badgeArtShadowOn}], true],
  ['Streaming logo', [
    {k: 'streaming_logo_source', label: 'Logo from', choices: [['any', 'Network, else where it streams'], ['originals', 'Original network'], ['available', 'Where it streams now']], when: streamingOn},
    {k: 'streaming_logo_max_w', label: 'Max width', min: 10, max: 600, int: true, when: streamingOn},
    {k: 'streaming_logo_max_h', label: 'Max height', min: 10, max: 300, int: true, when: streamingOn},
    {k: 'streaming_logo_h', label: 'Side', choices: [['left', 'Left'], ['right', 'Right']], when: streamingOn},
    {k: 'streaming_logo_v', label: 'Edge', choices: [['top', 'Top'], ['bottom', 'Bottom']], when: streamingOn},
    {k: 'streaming_logo_offset_x', label: 'In from the side', min: -100, max: 500, step: 1, when: streamingOn},
    {k: 'streaming_logo_offset_y', label: 'In from the edge', min: -100, max: 500, step: 1, when: streamingOn},
    {k: 'streaming_logo_shadow_enabled', label: 'Shadow', bool: true, when: streamingOn},
    {k: 'streaming_logo_shadow_color', label: 'Shadow color', color: true, when: streamingShadowOn},
    {k: 'streaming_logo_shadow_opacity', label: 'Shadow opacity (%)', min: 0, max: 100, int: true, when: streamingShadowOn},
    {k: 'streaming_logo_shadow_angle', label: 'Shadow angle (°)', min: -180, max: 180, int: true, when: streamingShadowOn},
    {k: 'streaming_logo_shadow_distance', label: 'Shadow distance', min: 0, max: 50, int: true, when: streamingShadowOn},
    {k: 'streaming_logo_shadow_size', label: 'Shadow size / blur', min: 0, max: 125, int: true, when: streamingShadowOn},
    {k: 'streaming_logo_shadow_spread', label: 'Shadow spread (%)', min: 0, max: 100, int: true, when: streamingShadowOn}], true],
  ['Status banner', [
    {k: 'status_banners', label: 'Category', banners: true, when: bannerOn},
    {k: 'status_banner_date_format', label: 'Date format', text: 'ddd dd/mm', when: bannerOn},
    {k: 'status_banner_simplify_dates', label: 'Today, tomorrow, weekday', bool: true, when: bannerOn}], true],
  ['Status banner bar', [
    {k: 'status_banner_h_align', label: 'Side', choices: ALIGN, when: bannerOn},
    {k: 'status_banner_v_align', label: 'Edge', choices: [['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom']], when: bannerOn},
    {k: 'status_banner_offset_x', label: 'In from the side', min: -300, max: 500, step: 1, when: bannerOn},
    {k: 'status_banner_offset_y', label: 'In from the edge', min: -300, max: 700, step: 1, when: bannerOn},
    {k: 'status_banner_width', label: 'Width', min: 50, max: 1000, step: 1, when: bannerOn},
    {k: 'status_banner_height', label: 'Height', min: 10, max: 300, step: 1, when: bannerOn},
    {k: 'status_banner_radius', label: 'Corner radius', min: 0, max: 150, step: 1, when: bannerOn},
    {k: 'status_banner_backdrop_opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, when: bannerOn},
    {k: 'status_banner_border_width', label: 'Border', min: 0, max: 20, step: 0.5, when: bannerOn},
    {k: 'status_banner_border_color', label: 'Border color', color: true, when: bannerBorderOn}], true],
  ['Status banner text', [
    {k: 'status_banner_font_file', label: 'Font', fonts: 'Default (Poppins Bold)', when: bannerOn},
    {k: 'status_banner_font_size', label: 'Size', min: 10, max: 200, int: true, when: bannerOn},
    {k: 'status_banner_letter_spacing', label: 'Letter spacing', min: -10, max: 40, step: 0.5, when: bannerOn},
    {k: 'status_banner_text_transform', label: 'Case', choices: [['uppercase', 'ABC'], ['lowercase', 'abc'], ['none', 'As written']], when: bannerOn},
    {k: 'status_banner_text_opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, when: bannerOn},
    {k: 'status_banner_text_align', label: 'Align in the bar', choices: ALIGN, when: bannerOn},
    {k: 'status_banner_padding', label: 'Padding at the ends', min: 0, max: 200, step: 1, when: bannerOn},
    {k: 'status_banner_text_offset_x', label: 'Nudge across', min: -100, max: 100, step: 1, when: bannerOn},
    {k: 'status_banner_text_offset_y', label: 'Nudge down', min: -100, max: 100, step: 1, when: bannerOn},
    {k: 'status_banner_stroke_width', label: 'Stroke', min: 0, max: 10, step: 0.5, when: bannerOn},
    {k: 'status_banner_stroke_opacity', label: 'Stroke opacity', min: 0, max: 1, step: 0.01, when: bannerStrokeOn},
    {k: 'status_banner_stroke_color', label: 'Stroke color', color: true, when: bannerStrokeOn},
    {k: 'status_banner_shadow_strength', label: 'Shadow', min: 0, max: 1, step: 0.01, when: bannerOn},
    {k: 'status_banner_shadow_blur', label: 'Shadow blur', min: 0, max: 30, step: 0.5, when: bannerShadowOn},
    {k: 'status_banner_shadow_offset_y', label: 'Shadow offset', min: -20, max: 20, step: 0.5, when: bannerShadowOn},
    {k: 'status_banner_shadow_color', label: 'Shadow color', color: true, when: bannerShadowOn}], true]];  // Seasons get no badges
// The Episode card mode's rows: sizes are pixels on a 3200px-wide card, and the page's 'none' gradient is the config's null.
const gradientOn = v => v.card_gradient !== 'none', titleAuto = v => v.title_color === 'auto', cardShadowOn = v => v.shadow_strength > 0;
const cardLogoShadowOn = v => logoOn(v) && v.card_logo_shadow_enabled, cardStrokeOn = v => v.stroke_opacity > 0;
const CARD_GROUPS = [
  ['Image', [
    {k: 'card_gradient', label: 'Gradient', choices: [['radial', 'Radial'], ['none', 'None']]},
    {k: 'gradient_center_x', label: 'Clear center across', min: 0, max: 1, step: 0.005, when: gradientOn},
    {k: 'gradient_center_y', label: 'Clear center down', min: 0, max: 1, step: 0.005, when: gradientOn},
    {k: 'gradient_radius_x', label: 'Fade width', min: 0.05, max: 2, step: 0.005, when: gradientOn},
    {k: 'gradient_radius_y', label: 'Fade height', min: 0.05, max: 2, step: 0.005, when: gradientOn},
    {k: 'gradient_softness', label: 'Softness', min: 0.5, max: 20, step: 0.1, when: gradientOn},
    {k: 'gradient_strength', label: 'Strength', min: 0, max: 1, step: 0.01, when: gradientOn},
    {k: 'gradient_corner_strength', label: 'Corner darkening', min: 0, max: 1, step: 0.01, when: gradientOn}]],
  ['Logo', [
    {k: 'logo_mode', label: 'Logo', choices: [['original', 'Show'], ['none', 'Hide']]},
    {k: 'uniform_logo_max_w', label: 'Max width', min: 1, max: 3200, int: true, when: logoOn},
    {k: 'uniform_logo_max_h', label: 'Max height', min: 1, max: 1800, int: true, when: logoOn},
    {k: 'card_logo_offset_x', label: 'Across (0 = left margin, 1 = right)', min: 0, max: 1, step: 0.005, when: logoOn},
    {k: 'card_logo_offset_y', label: 'Down (0 = top margin, 1 = bottom)', min: 0, max: 1, step: 0.005, when: logoOn},
    {k: 'card_logo_h_align', label: 'Align across', choices: ALIGN, when: logoOn},
    {k: 'card_logo_v_align', label: 'Align down', choices: [['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom']], when: logoOn},
    {k: 'card_logo_trim', label: 'Trim logo padding', bool: true, when: logoOn},
    {k: 'card_logo_shadow_enabled', label: 'Logo shadow', bool: true, when: logoOn},
    {k: 'card_logo_shadow_color', label: 'Shadow color', color: true, when: cardLogoShadowOn},
    {k: 'card_logo_shadow_opacity', label: 'Shadow opacity (%)', min: 0, max: 100, int: true, when: cardLogoShadowOn},
    {k: 'card_logo_shadow_angle', label: 'Shadow angle (°)', min: -180, max: 180, int: true, when: cardLogoShadowOn},
    {k: 'card_logo_shadow_distance', label: 'Shadow distance', min: 0, max: 150, int: true, when: cardLogoShadowOn},
    {k: 'card_logo_shadow_size', label: 'Shadow size / blur', min: 0, max: 250, int: true, when: cardLogoShadowOn},
    {k: 'card_logo_shadow_spread', label: 'Shadow spread (%)', min: 0, max: 100, int: true, when: cardLogoShadowOn}]],
  ['Title', [
    {k: 'title_font_file', label: 'Font', fonts: true},
    {k: 'title_font_size', label: 'Size', min: 10, max: 400, int: true},
    {k: 'title_color', label: 'Color', color: true, auto: true},
    {k: 'title_min_brightness', label: 'Darkest logo color', min: 0, max: 255, int: true, when: titleAuto},
    {k: 'text_transform', label: 'Case (title and numbers)', choices: [['none', 'As written'], ['uppercase', 'ABC'], ['lowercase', 'abc']]},
    {k: 'title_max_line_width', label: 'Characters per line', min: 1, max: 100, int: true},
    {k: 'title_max_lines', label: 'Most lines', min: 1, max: 10, int: true},
    {k: 'title_letter_spacing', label: 'Letter spacing', min: -20, max: 40, step: 0.25},
    {k: 'title_line_spacing', label: 'Line spacing (less is tighter)', min: -100, max: 100, step: 1},
    {k: 'title_x', label: 'Left edge', min: 0, max: 1600, step: 1},
    {k: 'title_bottom', label: 'Height above the bottom', min: 0, max: 900, step: 1}]],
  ['Season and episode', [
    {k: 'season_font_file', label: 'Season font', fonts: true},
    {k: 'episode_font_file', label: 'Episode font', fonts: true},
    {k: 'season_text', label: 'Season text', text: 'SEASON {season_number}'},
    {k: 'episode_text', label: 'Episode text', text: 'EPISODE {episode_number}'},
    {k: 'index_font_size', label: 'Size', min: 10, max: 300, int: true},
    {k: 'index_color', label: 'Color', color: true},
    {k: 'index_letter_spacing', label: 'Letter spacing', min: -20, max: 40, step: 0.25},
    {k: 'index_gap', label: 'Space between season and episode', min: 0, max: 300, step: 1},
    {k: 'index_x', label: 'Left edge', min: 0, max: 1600, step: 1},
    {k: 'index_bottom', label: 'Height above the bottom', min: 0, max: 900, step: 1}]],
  ['Outline and shadow', [
    {k: 'stroke_opacity', label: 'Outline opacity', min: 0, max: 1, step: 0.01},
    {k: 'title_stroke_width', label: 'Title outline', min: 0, max: 30, step: 0.5},
    {k: 'title_stroke_color', label: 'Title outline color', color: true, auto: true, when: cardStrokeOn},
    {k: 'index_stroke_width', label: 'Season and episode outline', min: 0, max: 30, step: 0.5},
    {k: 'index_stroke_color', label: 'Season and episode outline color', color: true, when: cardStrokeOn},
    {k: 'shadow_strength', label: 'Shadow', min: 0, max: 1, step: 0.01},
    {k: 'shadow_color', label: 'Shadow color', color: true, when: cardShadowOn},
    {k: 'shadow_blur', label: 'Shadow blur', min: 0, max: 100, step: 0.5, when: cardShadowOn},
    {k: 'shadow_offset_y', label: 'Shadow offset', min: -100, max: 100, step: 0.5, when: cardShadowOn}]]];
let tpl = null, tplBusy = false, tplNext = false, tplUrl = null, tplError = '', tplMounted = false;
let tplDraw = () => {};  // Repaints the editor; the root component below points it at itself
const HEX = /^#[0-9a-f]{6}$/i;
const canon = x => Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canon(x[k])])) : x;
const same = (a, b) => Array.isArray(a) && Array.isArray(b) ? [...a].sort().join() === [...b].sort().join()
  : HEX.test(a) && HEX.test(b) ? a.toLowerCase() === b.toLowerCase()
  : a && b && typeof a === 'object' && typeof b === 'object' ? JSON.stringify(canon(a)) === JSON.stringify(canon(b)) : a === b;
const TPL_MODES = [['poster', 'Poster'], ['season', 'Season'], ['episode', 'Episode card']];
const tplMode = () => tpl.mode;
const tplLayout = () => tpl.layouts.find(l => l.name === tpl.name);
const tplSaved = () => tplLayout()[tplMode()];
const tplEdits = () => tpl.edits[tpl.name + '|' + tplMode()] || (tpl.edits[tpl.name + '|' + tplMode()] = {});
const tplValues = () => ({...tplSaved(), ...tplEdits()});
// Season and Episode card are offered only to layouts that have season_options / episode_options (a movie layout has neither)
const tplModesFor = l => TPL_MODES.filter(([m]) => m === 'poster' || (m === 'season' ? l.seasons : l.cards));
// A layout's `media` lists what it's used for ('movies', 'tv', 'collections'), or is null when Plex couldn't say. Preview on lists
// just those titles; with none of its kind saved yet it lists them all, rather than leave the preview empty.
const tplSamples = () => {
  const fit = titles.filter(t => t.thumb && (tpl.mode === 'poster' || t.cat === 'tv')), media = tplLayout().media;
  const like = media ? fit.filter(t => media.includes(t.cat)) : fit;
  return like.length ? like : fit;
};
const tplUnsaved = () => !!tpl && Object.values(tpl.edits).some(e => Object.keys(e).length);
const tplRemember = () => saved.set('overlayrr-tpl', JSON.stringify({name: tpl.name, mode: tpl.mode, sample: tpl.sample, closed: tpl.closed}));
// "Find a setting": a row matches on its label or YAML name, and a group's name brings in the whole group.
const tplMatch = (f, group) => { const q = tpl.find.trim().toLowerCase(); return !q || [f.label, f.k, group].some(s => s.toLowerCase().includes(q)); };
const tplGroups = () => tpl.mode === 'episode' ? CARD_GROUPS : TPL_GROUPS.filter(g => !(g[2] && tpl.mode === 'season'));
const tplNote = (text, warn) => { tpl.note = {text, warn: !!warn}; tplDraw(); };
// Something changed: repaint, then ask the server for a new preview (once the page has the new frame to measure).
const tplChanged = () => { tpl.want = true; tplDraw(); };
// After a different layout, mode or saved data: a mode the layout lacks falls back to Poster, and the preview title must be one it can use.
function tplNormalize() {
  if (!tplModesFor(tplLayout()).some(([m]) => m === tpl.mode)) tpl.mode = 'poster';
  const samples = tplSamples();
  if (!samples.some(t => t.id === tpl.sample[tpl.mode])) tpl.sample[tpl.mode] = samples.length ? samples[0].id : null;
}
function tplSet(k, v) {
  const edits = tplEdits();
  if (same(v, tplSaved()[k])) delete edits[k]; else edits[k] = v;
  tplChanged();
}
// A box that shows what is being typed while it has focus (so "1." or an empty box isn't swapped for the saved number),
// and the setting itself once it loses focus.
function Draft({value, commit, ...attrs}) {
  const [draft, setDraft] = useState(null);
  return html`<input ...${attrs} value=${draft ?? value ?? ''}
    onInput=${e => { setDraft(e.target.value); commit(e.target.value); }} onBlur=${() => setDraft(null)} />`;
}
// One row per setting. Banner categories reuse it with their own value, set and reset.
function Field({f, value, set, reset, changed}) {
  const id = 'tf-' + f.k;
  let control;
  if (f.choices || f.badges) {
    const on = v => f.badges ? (value || []).includes(v) : value === v;
    const pick = v => f.badges ? set(BADGE_NAMES.map(b => b[0]).filter(b => b === v ? !on(v) : on(b))) : set(v);
    control = html`<div class=${(f.badges ? 'chips' : 'seg') + ' wide'} id=${id} role="group" aria-label=${f.label}>
      ${(f.choices || BADGE_NAMES).map(([v, t]) => html`<button type="button" key=${v} class=${on(v) ? 'on' : ''} aria-pressed=${String(on(v))} onClick=${() => pick(v)}>${t}</button>`)}</div>`;
  } else if (f.fonts) {  // The font files under the layout's resources/fonts; '' is no file (Pillow's plain font)
    const files = tpl.fonts || [];
    control = html`<select class="wide" id=${id} value=${value || ''} onChange=${e => set(e.target.value)}>
      <option value="">${f.fonts === true ? 'Default (plain font)' : f.fonts}</option>
      ${files.map(p => html`<option key=${p} value=${p}>${p.replace(/^.*\/fonts\//, '')}</option>`)}
      ${!!value && !files.includes(value) && html`<option value=${value}>${value}</option>`}</select>`;
  } else if (f.bool) {
    control = html`<div class="wide"><input type="checkbox" class="switch" role="switch" id=${id} checked=${!!value} onChange=${e => set(e.target.checked)} /></div>`;
  } else if (f.text) {
    control = html`<input type="text" class="wide" id=${id} placeholder=${f.text} spellcheck=${false} value=${value ?? ''} onInput=${e => set(e.target.value)} />`;
  } else if (f.color) {  // `auto` rows (the card's title color) also take the word auto, which the Auto button sets
    control = html`<div class="swatch">
        ${f.auto && html`<div class="seg"><button type="button" class=${value === 'auto' ? 'on' : ''} aria-pressed=${String(value === 'auto')} onClick=${() => set('auto')}>Auto</button></div>`}
        <input type="color" id=${id} value=${typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : '#000000'} onInput=${e => set(e.target.value.toUpperCase())} /></div>
      <${Draft} type="text" class="num" maxlength="7" spellcheck=${false} aria-label=${f.label + ' (hex)'} value=${value || ''}
        commit=${text => { const v = text.trim(); if (HEX.test(v)) set(v.toUpperCase()); else if (f.auto && v.toLowerCase() === 'auto') set('auto'); }} />`;
  } else {
    control = html`<input type="range" id=${id} min=${f.min} max=${f.max} step=${f.int ? 1 : f.step} value=${value} onInput=${e => set(+e.target.value)} />
      <${Draft} type="number" class="num" step=${f.int ? 1 : 'any'} aria-label=${f.label} value=${value}
        commit=${text => { if (text !== '' && isFinite(text)) set(f.int ? Math.round(+text) : +text); }} />`;
  }
  return html`<div class=${'fld' + (changed ? ' chg' : '')}>
    <label for=${id}>${f.label}<small>${f.k}</small></label>
    ${control}
    <button type="button" class="rst" title="Back to the saved value" aria-label=${'Reset ' + f.label} onClick=${reset}>↺</button></div>`;
}
// The status banner's categories: pick one (the preview shows it too) to edit its words, color, bar, window and priority. It is saved as the
// layout's status_banners mapping, which holds only what differs from the defaults (tpl.banners, from the server).
function Banners({f, v}) {
  const cat = () => tpl.banner || '', defs = () => tpl.banners[cat()] || {}, mine = all => (all || {})[cat()] || {};
  const pick = (all, key) => { const m = mine(all); return key in m ? m[key] : defs()[key]; };
  const global = () => tplValues().status_banner_backdrop_opacity;
  const kept = key => key in mine(tplSaved()[f.k]);  // Already written out in the YAML: it stays there, even at its default
  const put = (key, val) => {
    const all = JSON.parse(JSON.stringify(tplValues()[f.k] || {})), entry = {...mine(all)};
    if (same(val, defs()[key]) && !kept(key)) delete entry[key]; else entry[key] = val;
    if (Object.keys(entry).length) all[cat()] = entry; else delete all[cat()];
    tplSet(f.k, all);
  };
  const barOn = all => pick(all, 'backdrop') !== false;
  const subs = [
    {s: {label: 'Show this category', bool: true}, key: 'enabled', get: all => pick(all, 'enabled'), put: val => put('enabled', val)},
    {s: {label: 'Words', text: '{season} {episode} {date}'}, key: 'text', get: all => pick(all, 'text'), put: val => put('text', val)},
    {s: {label: 'Text color', color: true}, key: 'color', get: all => pick(all, 'color'), put: val => put('color', val)},
    {s: {label: 'Bar behind the words', bool: true}, key: 'bar', get: barOn, put: val => put('backdrop', val ? defs().backdrop || '#000000' : false)},
    {s: {label: 'Bar color', color: true}, key: 'backdrop', get: all => pick(all, 'backdrop') || '#000000', put: val => put('backdrop', val), when: barOn},
    {s: {label: 'Bar opacity', min: 0, max: 1, step: 0.01}, key: 'opacity', get: all => pick(all, 'opacity') ?? global(), put: val => put('opacity', same(val, global()) && !kept('opacity') ? null : val), when: barOn},
    {s: {label: 'Window in days', min: 0, max: 365, int: true}, key: 'days', get: all => pick(all, 'days'), put: val => put('days', val), when: () => defs().days != null},
    {s: {label: 'Priority (heaviest wins)', min: 0, max: 1000, int: true}, key: 'weight', get: all => pick(all, 'weight'), put: val => put('weight', val)}];
  const x = v[f.k], was = tplSaved()[f.k];
  return html`<div>
    <div class="fld"><label for=${'tf-' + f.k}>${f.label}<small>preview and edit</small></label>
      <select class="wide" id=${'tf-' + f.k} aria-label="Banner category to preview and edit" value=${cat()} onChange=${e => { tpl.banner = e.target.value; tplChanged(); }}>
        <option value="">None: the show’s own banner</option>${BANNER_CATEGORIES.map(([c, t]) => html`<option key=${c} value=${c}>${t}</option>`)}</select></div>
    ${!cat() && html`<p class="tip">Pick a category to edit its words, colors and window. The preview shows it on the sample title, with a made-up season and date.</p>`}
    ${cat() !== '' && subs.filter(sub => !sub.when || sub.when(x)).map(sub => html`<${Field} key=${sub.key} f=${{k: 'status_banners.' + sub.key, ...sub.s}}
      value=${sub.get(x)} set=${sub.put} reset=${() => sub.put(sub.get(was))} changed=${!same(sub.get(x), sub.get(was))} />`)}</div>`;
}
// Copy one section's settings from another layout's saved ones (the same Poster, Season or Episode card). They become unsaved
// changes, so the preview shows them and nothing is written until Save.
function tplCopy(list, group, from) {
  const src = tpl.layouts.find(l => l.name === from), mode = tplMode();
  if (!src || !src[mode]) return;
  const now = tplValues(), edits = tplEdits(), saved = tplSaved();
  let n = 0;
  for (const {k} of list) {
    const v = src[mode][k];
    if (v === undefined) continue;
    if (!same(v, now[k])) n++;
    if (same(v, saved[k])) delete edits[k]; else edits[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  }
  tplChanged();
  toast(n ? `Copied ${n} ${group} setting${n > 1 ? 's' : ''} from ${from}. Save to keep ${n > 1 ? 'them' : 'it'}.` : `${group} already matches ${from}.`);
}
function Group({name, list, v, edits, was, others}) {
  const finding = tpl.find.trim() !== '';  // While finding, the groups with a match are open whatever was collapsed
  const shown = list.filter(f => (!f.when || f.when(v)) && tplMatch(f, name)), count = list.filter(f => f.k in edits).length;
  return html`<details class="grp" open=${finding || !tpl.closed[name]} onToggle=${e => { if (!finding) { tpl.closed[name] = !e.target.open; tplRemember(); } }} hidden=${!shown.length}>
    <summary>${name}<span class="n" hidden=${!count}>${count}</span><span class="spacer"></span>
      ${others.length > 0 && html`<select class="cp" aria-label=${`Copy the ${name} settings from another layout`} value=""
        title="Copy this section’s saved settings from another layout. They stay unsaved changes until you save."
        onChange=${e => { tplCopy(list, name, e.target.value); e.target.value = ''; }}>
        <option value="">Copy from…</option>${others.map(l => html`<option key=${l.name} value=${l.name}>${l.name}</option>`)}</select>`}</summary>
    <div>${shown.map(f => f.banners ? html`<${Banners} key=${f.k} f=${f} v=${v} />`
      : html`<${Field} key=${f.k} f=${f} value=${v[f.k]} set=${x => tplSet(f.k, x)} reset=${() => tplSet(f.k, was[f.k])} changed=${f.k in edits} />`)}</div></details>`;
}
function TemplateView() {
  const [, bump] = useState(0);
  tplDraw = () => bump(n => n + 1);
  const loaded = !!(tpl && tpl.layouts), edits = loaded ? tplEdits() : {}, n = Object.keys(edits).length;
  useLayoutEffect(() => {
    document.body.classList.toggle('foot', n > 0);
    const tab = $('#views [data-view=template]'), dirty = tplUnsaved();  // The Template tab says so while you're on Titles
    tab.classList.toggle('dirty', dirty); tab.title = dirty ? 'Template has unsaved changes' : '';
  });
  useLayoutEffect(() => { if (tpl && tpl.want) { tpl.want = false; tplPreview(); } });
  if (!loaded) return tplError ? html`<p class="warnText">Couldn't load the layouts: ${tplError}</p>` : null;
  const layout = tplLayout(), modes = tplModesFor(layout), mode = tpl.mode, samples = tplSamples(), v = tplValues(), was = tplSaved();
  const modeUnsaved = (name, m) => Object.keys(tpl.edits[name + '|' + m] || {}).length > 0;
  const unsaved = name => TPL_MODES.some(([m]) => modeUnsaved(name, m));
  const finding = tpl.find.trim() !== '', groups = tplGroups();
  let hits = 0, gated = 0;  // Matching rows shown, and matching rows hidden because the option they depend on is off
  if (finding) for (const [name, list] of groups) for (const f of list) if (tplMatch(f, name)) { if (!f.when || f.when(v)) hits++; else gated++; }
  const setAll = closed => { for (const [name] of groups) tpl.closed[name] = closed; tplRemember(); tplDraw(); };
  const resetEdits = () => {
    const key = tpl.name + '|' + tplMode(), old = tpl.edits[key] || {}, count = Object.keys(old).length;
    delete tpl.edits[key]; tplChanged();
    toast(`Reset ${count} unsaved change${count === 1 ? '' : 's'}.`, false, ['Undo', () => { tpl.edits[key] = {...old, ...(tpl.edits[key] || {})}; tplChanged(); }]);
  };
  const others = tpl.layouts.filter(l => l.name !== layout.name && (mode === 'poster' || (mode === 'season' ? l.seasons : l.cards)));
  const pickSample = id => { tpl.sample[mode] = id; tplRemember(); tplChanged(); };
  const switchTo = change => { change(); tplNormalize(); tplRemember(); tplChanged(); };
  return html`
    <div class="tplbar">
      <select aria-label="Layout" value=${tpl.name} onChange=${e => switchTo(() => { tpl.name = e.target.value; })}>
        ${tpl.layouts.map(l => html`<option key=${l.name} value=${l.name}>${l.name + (unsaved(l.name) ? ' •' : '')}</option>`)}</select>
      ${modes.length > 1 && html`<div class="seg" role="group" aria-label="Poster, season or episode card">${modes.map(([m, t]) =>
        html`<button key=${m} class=${m === mode ? 'on' : ''} aria-pressed=${String(m === mode)} title=${modeUnsaved(tpl.name, m) ? t + ' (unsaved changes)' : null}
          onClick=${() => switchTo(() => { tpl.mode = m; })}>${t}${modeUnsaved(tpl.name, m) && html`<span class="dot" aria-hidden="true"></span>`}</button>`)}</div>`}
      <span class="uses">${layout.uses.length ? 'Used for ' + layout.uses.join(', ') : 'Not assigned to anything yet'}</span>
      <span class="spacer"></span>
      <label>Preview on <select aria-label="Preview on" value=${tpl.sample[mode] ?? ''} onChange=${e => pickSample(e.target.value)}>
        ${samples.map(t => html`<option key=${t.id} value=${t.id}>${named(t.title, t.year)}</option>`)}</select></label>
      <button class="ghost" title="Preview on a random title" disabled=${!samples.length}
        onClick=${() => pickSample(samples[Math.floor(Math.random() * samples.length)].id)}>Shuffle</button></div>
    <figure class="tplshot">
      <div class=${'tplframe' + (tpl.busy ? ' busy' : '') + (tpl.err ? ' err' : '')} id="tplframe" style=${`--ar:${v.width / v.height}`}>
        <img id="tplimg" alt="Preview" src=${tplUrl || undefined} /></div>
      <figcaption class=${'tplnote' + (tpl.note.warn ? ' warn' : '')} id="tplnote">${tpl.note.text}</figcaption></figure>
    <div class="tplctl">
      <div class="tplfind">
        <input type="search" id="tplfind" placeholder="Find a setting (name or YAML key)   /" aria-label="Find a setting" spellcheck=${false} value=${tpl.find}
          onInput=${e => { tpl.find = e.target.value; tplDraw(); }}
          onKeyDown=${e => { if (e.key === 'Escape' && tpl.find) { e.stopPropagation(); tpl.find = ''; tplDraw(); } }} />
        ${finding ? html`<span class="uses" role="status">${hits ? `${hits} setting${hits === 1 ? '' : 's'}` : `No setting matches “${tpl.find.trim()}”`}${gated ? `${hits ? ', plus ' : '. '}${gated} hidden until the option it depends on is on` : ''}</span>`
          : html`<button class="ghost" onClick=${() => setAll(true)}>Collapse all</button><button class="ghost" onClick=${() => setAll(false)}>Expand all</button>`}</div>
      ${mode === 'season' && html`<p class="tip">Season posters start from the layout’s poster settings; what you change here is saved under season_options.</p>`}
      ${mode === 'episode' && html`<p class="tip">Episode cards start from the layout’s poster settings; what you change here is saved under episode_options. Sizes are pixels on a 3200px-wide card.</p>`}
      ${groups.map(([name, list]) =>
        html`<${Group} key=${name} name=${name} list=${list} v=${v} edits=${edits} was=${was} others=${others} />`)}</div>
    <div class=${'tplfoot' + (n ? ' show' : '')} id="tplfoot" inert=${!n}>
      <span id="tplcount" title=${Object.entries(edits).map(([k, x]) => `${k}: ${JSON.stringify(was[k])} → ${JSON.stringify(x)}`).join('\n')}>${`${n} unsaved change${n === 1 ? '' : 's'}`}</span>
      <button title="Drop the unsaved changes to this layout's current section (you can undo it)" onClick=${resetEdits}>Reset</button>
      <button class="primary" id="tplsave" disabled=${!!tpl.saving} onClick=${tplSave}>${tpl.saving ? 'Saving…' : `Save to ${tpl.file}`}</button></div>`;
}
// One render in flight at most: changes made meanwhile are folded into the next one, so the preview keeps up with a
// dragged slider without queueing.
function tplPreview() {
  const frame = $('#tplframe');
  if (!tpl || !tpl.layouts || !frame || $('#tpl').hidden) return;
  if (tplBusy) { tplNext = true; return; }
  const id = tpl.sample[tplMode()];
  if (!id) return tplNote(tpl.mode !== 'poster' ? 'No TV show has a saved poster yet.' : 'No title has a saved poster yet. Run the script once first.', true);
  tplBusy = true; tplNext = false;
  const w = Math.min(720, Math.max(240, Math.round(frame.clientWidth * (window.devicePixelRatio || 1))));
  const slow = setTimeout(() => { tpl.busy = true; tplDraw(); }, 120);
  fetch('/api/template/preview', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Overlayrr': '1'},
    body: JSON.stringify({layout: tpl.name, mode: tpl.mode, values: tplEdits(), id, w, banner: tpl.banner || ''})})
    .then(async r => {
      if (r.status === 401) { location.reload(); throw new Error('Signed out'); }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
      const note = r.headers.get('X-Overlayrr-Note'), url = URL.createObjectURL(await r.blob()), next = new Image();
      next.src = url;
      await next.decode().catch(() => 0);  // Swap only once it's ready: no flash between frames
      if (tplUrl) URL.revokeObjectURL(tplUrl);
      tplUrl = url;
      tpl.err = false;
      const notes = (note || '').split(' ');
      tplNote([notes.includes('no-still') && 'No episode still is saved for this show, so the card is drawn on its poster.',
        notes.includes('no-logo') && 'This title has no logo saved, so none is drawn.'].filter(Boolean).concat(notes[0] ? ['Shuffle to try another.'] : []).join(' '));
    })
    .catch(e => { tpl.err = true; tplNote(e.message, true); })
    .finally(() => { clearTimeout(slow); tpl.busy = false; tplBusy = false; tplDraw(); if (tplNext) tplPreview(); });
}
async function tplSave() {
  const edits = tplEdits();
  if (!Object.keys(edits).length || tpl.saving) return;
  tpl.saving = true; tplDraw();
  try {
    Object.assign(tpl, await api('/api/template/save', {layout: tpl.name, mode: tpl.mode, values: edits, version: tpl.version}));
    delete tpl.edits[tpl.name + '|' + tplMode()];
    toast(`Saved to ${tpl.file}. ${tpl.mode === 'episode' ? 'Episode cards' : 'Posters'} using ${tpl.name} change on their next render: the next scheduled or hook run, or ${state.upload ? 'Push' : 'Render'} a title now.`);
  } catch (e) { fail(e); }
  tpl.saving = false;
  tplNormalize();
  tplChanged();
}
async function tplLoad() {
  tplError = '';
  try {
    const [d] = await Promise.all([api('/api/template'), ready.catch(() => 0)]);
    if (!tpl) {
      let keep = {};
      try { keep = JSON.parse(saved.get('overlayrr-tpl')) || {}; } catch (e) { /* nothing remembered */ }
      tpl = {name: keep.name, mode: TPL_MODES.some(([m]) => m === keep.mode) ? keep.mode : keep.season ? 'season' : 'poster', sample: keep.sample || {}, edits: {},
        closed: keep.closed && typeof keep.closed === 'object' ? keep.closed : {}, find: '', note: {text: '', warn: false}};
    }
    Object.assign(tpl, d);
    if (!tplLayout()) tpl.name = (tpl.layouts.find(l => l.name === d.default) || tpl.layouts[0]).name;
    tplNormalize();
    tpl.want = true;
  } catch (e) { tplError = e.message; }
  if (!tplMounted) { tplMounted = true; vrender(html`<${TemplateView} />`, $('#tpl')); }
  tplDraw();
}
