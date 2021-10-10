import type { Arguments, CommandBuilder } from 'yargs';

type Options = {
  images: boolean | true;
  video: boolean | true;
  // Ideally these would be coming from something higher, but I haven't figured
  // out how yargs does that yet.
  in_dir: string;
  out_dir: string;
  scratch_dir: string;
};

export const command: string = 'overlays <filename>';
export const desc: string = 'Generate overlays for <filename>';

export const builder: CommandBuilder<Options, Options> = (yargs) =>
  yargs
    .options({
      images: {
        type: 'boolean',
        describe: "Generate overlay images",
        default: true
      },
      video: {
        type: 'boolean',
        describe: "Generate overlay videos",
        default: true
      },
      in_dir: {
        type: 'string',
        demand: true,
        describe: "Input directory containing raw GoPro video"
      },
      out_dir: {
        type: 'string',
        demand: true,
        describe: "Output directory for generated assets"
      },
      scratch_dir: {
        type: 'string',
        describe: "Directory for temporary files",
        default: "./scratch"
      },
    })
    .positional('filename', { type: 'string', demandOption: false });

export const handler = (argv: Arguments<Options>): void => {
  const { name, upper } = argv;
  const greeting = `Hello, ${name}!`;
  process.stdout.write(upper ? greeting.toUpperCase() : greeting);
  process.exit(0);
};
