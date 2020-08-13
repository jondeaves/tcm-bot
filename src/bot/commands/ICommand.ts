import Discord, { Collection } from 'discord.js';
import MongoService from 'src/core/services/mongo.service';

export default interface ICommand {
  name: string;
  aliases?: string[];
  description: string;
  execute: (message: Discord.Message, args: string[], prefix?: string, commands?: Collection<string, ICommand>, dbService?: MongoService) => Promise<any>,
}