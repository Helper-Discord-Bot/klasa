const { Structures, Collection, APIMessage, Permissions: { FLAGS } } = require('discord.js');
const { regExpEsc } = require('../util/util');

module.exports = Structures.extend('Message', Message => {
	/**
	 * Klasa's Extended Message
	 * @extends external:Message
	 */
	class KlasaMessage extends Message {

		/**
		 * @typedef {object} CachedPrefix
		 * @property {number} length The length of the prefix
		 * @property {RegExp | null} regex The RegExp for the prefix
		 */

		/**
		 * @param {...*} args Normal D.JS Message args
		 */
		constructor(...args) {
			super(...args);

			/**
			 * The command being run
			 * @since 0.0.1
			 * @type {?Command}
			 */
			this.command = this.command || null;

			/**
			 * The name of the command being run
			 * @since 0.5.0
			 * @type {?string}
			 */
			this.commandText = this.commandText || null;

			/**
			 * The prefix used
			 * @since 0.0.1
			 * @type {?RegExp}
			 */
			this.prefix = this.prefix || null;

			/**
			 * The length of the prefix used
			 * @since 0.0.1
			 * @type {?number}
			 */
			this.prefixLength = typeof this.prefixLength === 'number' ? this.prefixLength : null;

			/**
			 * A command prompt/argument handler
			 * @since 0.5.0
			 * @type {CommandPrompt}
			 * @private
			 */
			this.prompter = this.prompter || null;
		}

		/**
		 * The string arguments derived from the usageDelim of the command
		 * @since 0.0.1
		 * @type {string[]}
		 * @readonly
		 */
		get args() {
			return this.prompter ? this.prompter.args : [];
		}

		/**
		 * The parameters resolved by this class
		 * @since 0.0.1
		 * @type {any[]}
		 * @readonly
		 */
		get params() {
			return this.prompter ? this.prompter.params : [];
		}

		/**
		 * The flags resolved by this class
		 * @since 0.5.0
		 * @type {Object}
		 * @readonly
		 */
		get flagArgs() {
			return this.prompter ? this.prompter.flags : {};
		}

		/**
		 * If the command reprompted for missing args
		 * @since 0.0.1
		 * @type {boolean}
		 * @readonly
		 */
		get reprompted() {
			return this.prompter ? this.prompter.reprompted : false;
		}

		/**
		 * If this message can be reacted to by the bot
		 * @since 0.0.1
		 * @type {boolean}
		 * @readonly
		 */
		get reactable() {
			if (!this.guild) return true;
			return this.channel.readable && this.channel.permissionsFor(this.guild.me).has([FLAGS.ADD_REACTIONS, FLAGS.READ_MESSAGE_HISTORY], false);
		}

		/**
		 * The usable commands by the author in this message's context
		 * @since 0.0.1
		 * @returns {Collection<string, Command>} The filtered CommandStore
		 */
		async usableCommands() {
			const col = new Collection();
			await Promise.all(this.client.commands.map((command) =>
				this.client.inhibitors.run(this, command, true)
					.then(() => { col.set(command.name, command); })
					.catch(() => {
						// noop
					})
			));
			return col;
		}

		/**
		 * Checks if the author of this message, has applicable permission in this message's context of at least min
		 * @since 0.0.1
		 * @param {number} min The minimum level required
		 * @returns {boolean}
		 */
		async hasAtLeastPermissionLevel(min) {
			const { permission } = await this.client.permissionLevels.run(this, min);
			return permission;
		}
		/**
		 * Sends a message that will be editable via command editing (if nothing is attached)
		 * @since 0.5.0
		 * @param {string} key The Language key to send
		 * @param {Array<*>} [localeArgs] The language arguments to pass
		 * @param {external:MessageOptions} [options] The D.JS message options plus Language arguments
		 * @returns {Promise<KlasaMessage|KlasaMessage[]>}
		 */
		sendLocale(key, localeArgs = [], options = {}) {
			if (!Array.isArray(localeArgs)) [options, localeArgs] = [localeArgs, []];
			return this.send(APIMessage.transformOptions(this.language.get(key, ...localeArgs), options));
		}

		get language() {
			return this.guild ? this.guild.language : this.client.languages.default;
		}

		get guildSettings() {
			return this.guild ? this.guild.settings : this.client.gateways.guilds.schema.defaults;
		}
		/**
		 * Parses this message as a command
		 * @since 0.5.0
		 * @private
		 */
		_parseCommand() {
			// Clear existing command state so edits to non-commands do not re-run commands
			this.prefix = null;
			this.prefixLength = null;
			this.commandText = null;
			this.command = null;
			this.prompter = null;

			try {
				const prefix = this._mentionPrefix() || this._customPrefix() || this._naturalPrefix() || this._prefixLess();

				if (!prefix) return;

				this.prefix = prefix.regex;
				this.prefixLength = prefix.length;
				this.commandText = this.content.slice(prefix.length).trim().split(' ')[0].toLowerCase();
				this.command = this.client.commands.get(this.commandText) || null;

				if (!this.command) return;

				this.prompter = this.command.usage.createPrompt(this, {
					flagSupport: this.command.flagSupport,
					quotedStringSupport: this.command.quotedStringSupport,
					time: this.command.promptTime,
					limit: this.command.promptLimit
				});
			} catch (error) {
				return;
			}
		}

		/**
		 * Checks if the per-guild or default prefix is used
		 * @since 0.5.0
		 * @returns {CachedPrefix | null}
		 * @private
		 */
		_customPrefix() {
			if (!this.guildSettings.prefix) return null;
			for (const prf of Array.isArray(this.guildSettings.prefix) ? this.guildSettings.prefix : [this.guildSettings.prefix]) {
				const testingPrefix = this.constructor.prefixes.get(prf) || this.constructor.generateNewPrefix(prf, this.client.options.prefixCaseInsensitive ? 'i' : '');
				if (testingPrefix.regex.test(this.content)) return testingPrefix;
			}
			return null;
		}

		/**
		 * Checks if the mention was used as a prefix
		 * @since 0.5.0
		 * @returns {CachedPrefix | null}
		 * @private
		 */
		_mentionPrefix() {
			const mentionPrefix = this.client.mentionPrefix.exec(this.content);
			return mentionPrefix ? { length: mentionPrefix[0].length, regex: this.client.mentionPrefix } : null;
		}

		/**
		 * Checks if the natural prefix is used
		 * @since 0.5.0
		 * @returns {CachedPrefix | null}
		 * @private
		 */
		_naturalPrefix() {
			if (this.guildSettings.disableNaturalPrefix || !this.client.options.regexPrefix) return null;
			const results = this.client.options.regexPrefix.exec(this.content);
			return results ? { length: results[0].length, regex: this.client.options.regexPrefix } : null;
		}

		/**
		 * Checks if a prefixless scenario is possible
		 * @since 0.5.0
		 * @returns {CachedPrefix | null}
		 * @private
		 */
		_prefixLess() {
			return this.client.options.noPrefixDM && this.channel.type === 'dm' ? { length: 0, regex: null } : null;
		}

		/**
		 * Caches a new prefix regexp
		 * @since 0.5.0
		 * @param {string} prefix The prefix to store
		 * @param {string} flags The flags for the RegExp
		 * @returns {CachedPrefix}
		 * @private
		 */
		static generateNewPrefix(prefix, flags) {
			const prefixObject = { length: prefix.length, regex: new RegExp(`^${regExpEsc(prefix)}`, flags) };
			this.prefixes.set(prefix, prefixObject);
			return prefixObject;
		}

	}

	/**
	 * Cache of RegExp prefixes
	 * @since 0.5.0
	 * @type {Map<string, CachedPrefix>}
	 * @private
	 */
	KlasaMessage.prefixes = new Map();

	return KlasaMessage;
});
