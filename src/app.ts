import { exit } from 'process';
import Discord from 'discord.js';
import mongoose from 'mongoose';

import container from './inversity.config';

import ConfigService from './core/services/config.service';
import LoggerService from './core/services/logger.service';

import ICommand from './bot/commands/ICommand';
import rawCommands from './bot/commands';

export default class App {
  private _configService: ConfigService = container.resolve<ConfigService>(ConfigService);
  private _loggerService: LoggerService = container.resolve<LoggerService>(LoggerService);

  private _discordClient: Discord.Client;
  private _db: mongoose.Connection;

  public async init(): Promise<void> {
    await this.dbConnect();
    console.log(this._db);

    this._discordClient = new Discord.Client();
    const commandList = new Discord.Collection<string, ICommand>();

    rawCommands.forEach(rawCommand => {
      commandList.set(rawCommand.name, rawCommand);
    });

    // Triggers once after connecting to server
    this._discordClient.once('ready', () => {
      this._loggerService.log('info', 'The Bot is connected to Discord server');
    });

    // Triggers on every message the bot can see
    this._discordClient.on('message', async message => {
      const prefix = this._configService.get('BOT_TRIGGER');

      // If the message either doesn't start with the prefix or was sent by a bot, exit early.
      if (!message.content.startsWith(prefix) || message.author.bot) return;

      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();
      const command = commandList.get(commandName) || commandList.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

      if (!command) {
        return message.reply('Monkey no understand that command yet!');
      };

      try {
        await command.execute(message, args, prefix, commandList);
      } catch (error) {
        this._loggerService.log('error', error.message);
        message.reply('there was an error trying to execute that command!');
      }
    });

    this._discordClient.on('guildMemberAdd', member => {
      // base
      const greetings = ["Hello, {name}! CA greets you!", "Welcome to CA, {name}!", "Hi {name}! Welcome to CA!"];
      const greeting = greetings[Math.floor(Math.random() * greetings.length)];
      // favor
      const flavors = [
        "As PROMISED, grab a free pie! Courtesy of {random}!",
        "The water is pure here! You should ask {random} for their water purified water for a sip!",
        "Welcome to CA! Home of the sane, the smart and {random}!"
      ];
      const randomMember = member.guild.members.cache.random();
      const flavor = flavors[Math.floor(Math.random() * flavors.length)];
      // result
      member.guild.systemChannel.send(greeting.replace('{name}', member.displayName) + " " + flavor.replace('{random}', randomMember.displayName));
    });

    this._discordClient.login(this._configService.get('DISCORD_BOT_TOKEN'))
      .catch((reason) => {
        this._loggerService.log('error', `Cannot initialise Discord client. Check the token: ${this._configService.get('DISCORD_BOT_TOKEN')}`);
        exit(1);
      });
  }

  private async dbConnect() {
    console.log('1');
    return new Promise((resolve, reject) => {
      this._db = mongoose.connection;

      console.log('2');

      mongoose.connect(this._configService.get('MONGODB_URI'), { useNewUrlParser: true, useUnifiedTopology: true })
        .then(() => {

          console.log('3');
          this._db.on('error', (error) => {
            console.log('4');
            console.log(error);
            reject(error)
          });
          this._db.once('open', () => {

            console.log('4');
            this._loggerService.log('info', 'Connected to database');
            resolve();
          });
        })
        .catch(reject)
    });
  }
}
