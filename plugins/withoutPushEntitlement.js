// FicShelf only uses local notifications (new-chapter alerts scheduled on the device), so it
// doesn't need the Push Notifications entitlement that the expo-notifications plugin adds.
// Removing it lets the app be signed with a free Apple ID ("Personal Team") in Xcode, and
// skips the push setup EAS would otherwise ask about.
// Keep this plugin FIRST in app.json "plugins": config-plugin mods run in reverse order, so
// listing it first makes it run after expo-notifications has written the entitlement.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
